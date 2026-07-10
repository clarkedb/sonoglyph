//! The streaming DSP engine — a port of `TsDspEngine` in
//! `packages/dsp/src/engine.ts`. Samples are appended to an internal buffer;
//! every time a full analysis window is available, the engine emits one frame
//! per configured stream and advances by the hop size. Everything runs on
//! plain `f32` buffers, identically on native and (later) WASM.

use sonoglyph_fft::{make_fft, Fft, FftBackend};

use crate::peaks::{detect_peaks, PeakOptions, SpectralPeak};
use crate::spectrum::{envelope, spectrum_magnitudes, Envelope};
use crate::window::{make_window, window_sum, WindowName};

pub const SPECTRUM_VERSION: u32 = 1;
pub const PEAKS_VERSION: u32 = 1;
pub const ENVELOPE_VERSION: u32 = 1;
pub const SAMPLES_VERSION: u32 = 1;

/// Well-known feature streams the engine produces.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Stream {
    Spectrum,
    Peaks,
    Envelope,
    Samples,
}

/// Payload of the `spectrum` stream.
#[derive(Clone, Debug)]
pub struct SpectrumData {
    /// FFT magnitudes for bins 0..=N/2 (DC through Nyquist).
    pub magnitudes: Vec<f32>,
    /// Frequency width of one bin, in Hz.
    pub bin_hz: f64,
    /// Window function applied before the FFT.
    pub window: WindowName,
}

/// Payload of the `peaks` stream. Sorted by descending magnitude.
#[derive(Clone, Debug)]
pub struct PeaksData {
    pub peaks: Vec<SpectralPeak>,
}

/// Payload of the `samples` stream: the raw, unwindowed analysis frame.
#[derive(Clone, Debug)]
pub struct SamplesData {
    pub samples: Vec<f32>,
}

/// Stream-specific frame payload.
#[derive(Clone, Debug)]
pub enum FrameData {
    Spectrum(SpectrumData),
    Peaks(PeaksData),
    Envelope(Envelope),
    Samples(SamplesData),
}

/// One frame of one named feature stream.
#[derive(Clone, Debug)]
pub struct FeatureFrame {
    pub stream: Stream,
    pub version: u32,
    /// Frame start, in seconds of stream time.
    pub time: f64,
    /// Seconds of signal this frame describes (the analysis window length).
    pub span: f64,
    /// Seconds between successive frames of this stream.
    pub hop: f64,
    pub data: FrameData,
}

/// Engine configuration. `EngineOptions::default()` matches the TS
/// `DEFAULT_ENGINE_OPTIONS` (tuned for DTMF at 48 kHz).
#[derive(Clone, Debug)]
pub struct EngineOptions {
    pub sample_rate: f64,
    pub window_size: usize,
    pub hop_size: usize,
    pub window: WindowName,
    pub streams: Vec<Stream>,
}

impl Default for EngineOptions {
    fn default() -> Self {
        Self {
            sample_rate: 48_000.0,
            window_size: 2048,
            hop_size: 512,
            window: WindowName::Hann,
            streams: vec![Stream::Spectrum, Stream::Peaks, Stream::Envelope],
        }
    }
}

/// Samples in, feature frames out — a pure stream transformer over `f32`
/// buffers. The same bytes in produce the same frames out.
pub struct DspEngine {
    options: EngineOptions,
    fft: Box<dyn Fft>,
    window: Vec<f32>,
    window_norm: f64,
    bin_hz: f64,
    /// Buffered samples not yet consumed by a hop.
    buffer: Vec<f32>,
    buffered: usize,
    /// Stream time (seconds) of `buffer[0]`.
    buffer_start_sec: f64,
}

impl DspEngine {
    /// Build the engine with the bit-exact reference FFT (the default; holds
    /// the golden contract).
    ///
    /// # Panics
    /// If `window_size` is not a power of two ≥ 2, or `hop_size` is not in
    /// `[1, window_size]`.
    pub fn new(options: EngineOptions) -> Self {
        Self::with_backend(options, FftBackend::RadixTwo)
    }

    /// Build the engine with a specific FFT backend — `RustFft` for speed
    /// (numerically equivalent), `RadixTwo` for the bit-exact reference.
    ///
    /// # Panics
    /// If `window_size` is not a power of two ≥ 2, or `hop_size` is not in
    /// `[1, window_size]`.
    pub fn with_backend(options: EngineOptions, backend: FftBackend) -> Self {
        assert!(
            options.window_size >= 2 && (options.window_size & (options.window_size - 1)) == 0,
            "windowSize must be a power of two, got {}",
            options.window_size
        );
        assert!(
            options.hop_size >= 1 && options.hop_size <= options.window_size,
            "hopSize must be in [1, windowSize], got {}",
            options.hop_size
        );

        let fft = make_fft(backend, options.window_size);
        let window = make_window(options.window, options.window_size);
        // Normalize so a full-scale sine has magnitude ~1.0 in the spectrum.
        let window_norm = window_sum(&window) / 2.0;
        let bin_hz = options.sample_rate / options.window_size as f64;
        let buffer = vec![0f32; options.window_size * 4];

        Self {
            options,
            fft,
            window,
            window_norm,
            bin_hz,
            buffer,
            buffered: 0,
            buffer_start_sec: 0.0,
        }
    }

    /// The engine's configuration.
    pub fn options(&self) -> &EngineOptions {
        &self.options
    }

    /// Append samples and return every feature frame that became complete,
    /// in time order, grouped per analysis hop.
    pub fn push(&mut self, samples: &[f32]) -> Vec<FeatureFrame> {
        self.ensure_capacity(self.buffered + samples.len());
        self.buffer[self.buffered..self.buffered + samples.len()].copy_from_slice(samples);
        self.buffered += samples.len();

        let window_size = self.options.window_size;
        let hop_size = self.options.hop_size;
        let sample_rate = self.options.sample_rate;

        let mut frames = Vec::new();
        let mut offset = 0;
        while self.buffered - offset >= window_size {
            let time = self.buffer_start_sec + offset as f64 / sample_rate;
            let frame = &self.buffer[offset..offset + window_size];
            self.analyze(frame, time, &mut frames);
            offset += hop_size;
        }

        if offset > 0 {
            self.buffer.copy_within(offset..self.buffered, 0);
            self.buffered -= offset;
            self.buffer_start_sec += offset as f64 / sample_rate;
        }
        frames
    }

    /// Clear buffered samples and reset stream time to zero.
    pub fn reset(&mut self) {
        self.buffered = 0;
        self.buffer_start_sec = 0.0;
    }

    fn analyze(&self, frame: &[f32], time: f64, out: &mut Vec<FeatureFrame>) {
        let hop = self.options.hop_size as f64 / self.options.sample_rate;
        let span = self.options.window_size as f64 / self.options.sample_rate;
        let has = |s: Stream| self.options.streams.contains(&s);

        if has(Stream::Spectrum) || has(Stream::Peaks) {
            let magnitudes =
                spectrum_magnitudes(frame, &self.window, self.window_norm, self.fft.as_ref());
            // Compute peaks (borrowing magnitudes) before moving magnitudes into
            // the spectrum frame, keeping the TS emission order: spectrum, peaks.
            let peaks = has(Stream::Peaks)
                .then(|| detect_peaks(&magnitudes, &PeakOptions::new(self.bin_hz)));
            if has(Stream::Spectrum) {
                out.push(FeatureFrame {
                    stream: Stream::Spectrum,
                    version: SPECTRUM_VERSION,
                    time,
                    span,
                    hop,
                    data: FrameData::Spectrum(SpectrumData {
                        magnitudes,
                        bin_hz: self.bin_hz,
                        window: self.options.window,
                    }),
                });
            }
            if let Some(peaks) = peaks {
                out.push(FeatureFrame {
                    stream: Stream::Peaks,
                    version: PEAKS_VERSION,
                    time,
                    span,
                    hop,
                    data: FrameData::Peaks(PeaksData { peaks }),
                });
            }
        }

        if has(Stream::Samples) {
            // A copy, not a view: the engine reuses its buffer, and samples
            // consumers may hold frames across hops.
            out.push(FeatureFrame {
                stream: Stream::Samples,
                version: SAMPLES_VERSION,
                time,
                span,
                hop,
                data: FrameData::Samples(SamplesData {
                    samples: frame.to_vec(),
                }),
            });
        }

        if has(Stream::Envelope) {
            out.push(FeatureFrame {
                stream: Stream::Envelope,
                version: ENVELOPE_VERSION,
                time,
                span,
                hop,
                data: FrameData::Envelope(envelope(frame)),
            });
        }
    }

    fn ensure_capacity(&mut self, needed: usize) {
        if needed <= self.buffer.len() {
            return;
        }
        let mut size = self.buffer.len();
        while size < needed {
            size *= 2;
        }
        self.buffer.resize(size, 0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    const SR: f64 = 48_000.0;

    fn opts(window_size: usize, hop_size: usize) -> EngineOptions {
        EngineOptions {
            window_size,
            hop_size,
            ..Default::default()
        }
    }

    fn sine(freq: f64, n: usize, amp: f64) -> Vec<f32> {
        let step = 2.0 * PI * freq / SR;
        (0..n)
            .map(|i| (amp * (step * i as f64).sin()) as f32)
            .collect()
    }

    #[test]
    fn emits_one_frame_per_stream_per_hop() {
        let mut engine = DspEngine::new(opts(1024, 512));
        // 2048 samples: windows start at 0, 512, 1024 → 3 hops × 3 streams.
        let frames = engine.push(&vec![0f32; 2048]);
        assert_eq!(frames.len(), 9);
        let streams: Vec<Stream> = frames.iter().map(|f| f.stream).collect();
        assert_eq!(
            streams,
            [
                Stream::Spectrum,
                Stream::Peaks,
                Stream::Envelope,
                Stream::Spectrum,
                Stream::Peaks,
                Stream::Envelope,
                Stream::Spectrum,
                Stream::Peaks,
                Stream::Envelope,
            ]
        );
    }

    #[test]
    fn frame_times_advance_by_hop() {
        let mut engine = DspEngine::new(opts(1024, 256));
        let frames = engine.push(&vec![0f32; 4800]);
        let times: Vec<f64> = frames
            .iter()
            .filter(|f| f.stream == Stream::Envelope)
            .map(|f| f.time)
            .collect();
        for w in times.windows(2) {
            assert!((w[1] - w[0] - 256.0 / SR).abs() < 1e-12);
        }
    }

    #[test]
    fn chunking_invariant() {
        let signal = sine(440.0, 14_400, 0.8);

        let mut whole = DspEngine::new(EngineOptions::default());
        let whole_frames = whole.push(&signal);

        let mut chunked = DspEngine::new(EngineOptions::default());
        let mut chunked_frames = Vec::new();
        for chunk in signal.chunks(128) {
            chunked_frames.extend(chunked.push(chunk));
        }

        assert_eq!(whole_frames.len(), chunked_frames.len());
        for (a, b) in whole_frames.iter().zip(&chunked_frames) {
            assert_eq!(a.stream, b.stream);
            assert!((a.time - b.time).abs() < 1e-9);
            if let (FrameData::Spectrum(x), FrameData::Spectrum(y)) = (&a.data, &b.data) {
                assert_eq!(x.magnitudes, y.magnitudes);
            }
        }
    }

    #[test]
    fn reset_rewinds_stream_time() {
        let mut engine = DspEngine::new(opts(1024, 512));
        engine.push(&vec![0f32; 4096]);
        engine.reset();
        let frames = engine.push(&vec![0f32; 1024]);
        assert_eq!(frames[0].time, 0.0);
    }

    #[test]
    fn full_scale_sine_reads_near_one_and_rms_707() {
        let mut engine = DspEngine::new(EngineOptions::default());
        let frames = engine.push(&sine(1000.0, 4096, 1.0));
        let spectrum = frames
            .iter()
            .find(|f| f.stream == Stream::Spectrum)
            .unwrap();
        if let FrameData::Spectrum(s) = &spectrum.data {
            let max = s.magnitudes.iter().cloned().fold(0f32, f32::max) as f64;
            assert!(max > 0.9 && max < 1.1, "max {max}");
        }
        let env = frames
            .iter()
            .find(|f| f.stream == Stream::Envelope)
            .unwrap();
        if let FrameData::Envelope(e) = &env.data {
            assert!((e.rms - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-2);
            assert!((e.peak - 1.0).abs() < 1e-2);
        }
    }

    #[test]
    #[should_panic(expected = "power of two")]
    fn rejects_non_power_of_two_window() {
        DspEngine::new(opts(1000, 500));
    }

    #[test]
    #[should_panic(expected = "hopSize")]
    fn rejects_bad_hop() {
        DspEngine::new(opts(1024, 2048));
    }
}
