//! wasm-bindgen exports. The primitive functions mirror the TypeScript
//! `@sonoglyph/dsp` API (camelCase). The streaming engine ([`WasmDspEngine`])
//! takes its samples through a reusable input buffer in WASM memory rather than
//! a fresh `Float32Array` per call — the zero-copy input path for the hot loop.

use wasm_bindgen::prelude::*;

use crate::engine::{DspEngine, EngineOptions, FeatureFrame, FrameData, Stream};
use crate::goertzel;
use crate::window::WindowName;

#[wasm_bindgen(js_name = goertzelMagnitude)]
pub fn goertzel_magnitude(samples: &[f32], frequency_hz: f64, sample_rate: f64) -> f64 {
    goertzel::goertzel_magnitude(samples, frequency_hz, sample_rate)
}

#[wasm_bindgen(js_name = goertzelPower)]
pub fn goertzel_power(samples: &[f32], frequency_hz: f64, sample_rate: f64) -> f64 {
    goertzel::goertzel_power(samples, frequency_hz, sample_rate)
}

fn window_from_u8(w: u8) -> WindowName {
    match w {
        0 => WindowName::Rectangular,
        2 => WindowName::Hamming,
        3 => WindowName::Blackman,
        _ => WindowName::Hann,
    }
}

fn streams_from_mask(mask: u8) -> Vec<Stream> {
    let mut streams = Vec::new();
    if mask & 0b0001 != 0 {
        streams.push(Stream::Spectrum);
    }
    if mask & 0b0010 != 0 {
        streams.push(Stream::Peaks);
    }
    if mask & 0b0100 != 0 {
        streams.push(Stream::Envelope);
    }
    if mask & 0b1000 != 0 {
        streams.push(Stream::Samples);
    }
    streams
}

fn stream_to_u8(stream: Stream) -> u8 {
    match stream {
        Stream::Spectrum => 0,
        Stream::Peaks => 1,
        Stream::Envelope => 2,
        Stream::Samples => 3,
    }
}

/// The streaming DSP engine, across the WASM boundary. Write samples into the
/// reusable input buffer (a `Float32Array` view over [`wasm_memory`] at
/// [`WasmDspEngine::input_ptr`]) and call [`WasmDspEngine::push`] with the
/// length — no per-call array marshalling. The frames from the last push are
/// read back through the getters until the next push.
#[wasm_bindgen(js_name = DspEngine)]
pub struct WasmDspEngine {
    engine: DspEngine,
    input: Vec<f32>,
    frames: Vec<FeatureFrame>,
}

#[wasm_bindgen(js_class = DspEngine)]
impl WasmDspEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(
        sample_rate: f64,
        window_size: usize,
        hop_size: usize,
        window: u8,
        streams_mask: u8,
        input_capacity: usize,
    ) -> WasmDspEngine {
        let options = EngineOptions {
            sample_rate,
            window_size,
            hop_size,
            window: window_from_u8(window),
            streams: streams_from_mask(streams_mask),
        };
        WasmDspEngine {
            engine: DspEngine::new(options),
            // Fixed capacity, never grown, so `input_ptr` stays valid.
            input: vec![0.0; input_capacity.max(1)],
            frames: Vec::new(),
        }
    }

    /// Byte address of the reusable input buffer within WASM memory.
    #[wasm_bindgen(js_name = inputPtr)]
    pub fn input_ptr(&self) -> usize {
        self.input.as_ptr() as usize
    }

    /// Capacity of the input buffer, in samples.
    #[wasm_bindgen(js_name = inputCapacity)]
    pub fn input_capacity(&self) -> usize {
        self.input.len()
    }

    /// Process the first `len` samples of the input buffer; returns the number
    /// of frames produced (readable via the getters until the next push).
    ///
    /// # Panics
    /// If `len` exceeds the input capacity.
    pub fn push(&mut self, len: usize) -> usize {
        assert!(len <= self.input.len(), "len {len} exceeds input capacity");
        self.frames = self.engine.push(&self.input[..len]);
        self.frames.len()
    }

    pub fn reset(&mut self) {
        self.engine.reset();
        self.frames.clear();
    }

    #[wasm_bindgen(js_name = frameCount)]
    pub fn frame_count(&self) -> usize {
        self.frames.len()
    }

    #[wasm_bindgen(js_name = frameStream)]
    pub fn frame_stream(&self, i: usize) -> u8 {
        stream_to_u8(self.frames[i].stream)
    }

    #[wasm_bindgen(js_name = frameTime)]
    pub fn frame_time(&self, i: usize) -> f64 {
        self.frames[i].time
    }

    /// Spectrum magnitudes of frame `i` as a fresh `Float32Array` (empty if the
    /// frame is not a spectrum frame).
    #[wasm_bindgen(js_name = spectrumMagnitudes)]
    pub fn spectrum_magnitudes(&self, i: usize) -> Vec<f32> {
        match &self.frames[i].data {
            FrameData::Spectrum(s) => s.magnitudes.clone(),
            _ => Vec::new(),
        }
    }

    #[wasm_bindgen(js_name = envelopeRms)]
    pub fn envelope_rms(&self, i: usize) -> f64 {
        match &self.frames[i].data {
            FrameData::Envelope(e) => e.rms,
            _ => f64::NAN,
        }
    }

    #[wasm_bindgen(js_name = envelopePeak)]
    pub fn envelope_peak(&self, i: usize) -> f64 {
        match &self.frames[i].data {
            FrameData::Envelope(e) => e.peak,
            _ => f64::NAN,
        }
    }
}

/// The module's linear memory — for building typed-array views over the engine
/// input buffer (see [`WasmDspEngine::input_ptr`]).
#[wasm_bindgen(js_name = wasmMemory)]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}
