//! Spectral peak detection — a bit-exact port of `packages/dsp/src/peaks.ts`.
//!
//! A pure tone rarely lands exactly on an FFT bin; its energy peaks at the
//! nearest bin with the true frequency between neighbors. Fitting a parabola
//! through the peak bin and its two neighbors (in log-magnitude, where windowed
//! peaks are near-parabolic) recovers the true frequency to a fraction of a
//! bin — which is what lets a ~12 Hz-bin FFT check DTMF frequencies against a
//! ±1.5% tolerance.

/// A single detected spectral peak.
#[derive(Clone, Debug)]
pub struct SpectralPeak {
    /// Interpolated peak frequency, in Hz.
    pub frequency_hz: f64,
    /// Interpolated peak magnitude (same units as the spectrum).
    pub magnitude: f64,
    /// Index of the underlying FFT bin the peak was found at.
    pub bin: usize,
}

/// Options for [`detect_peaks`]. `PeakOptions::new(bin_hz)` uses the engine
/// defaults.
pub struct PeakOptions {
    /// Frequency width of one FFT bin, in Hz.
    pub bin_hz: f64,
    /// Ignore peaks below this magnitude (absolute, post-normalization).
    pub min_magnitude: f64,
    /// Ignore peaks quieter than `max_magnitude * relative_threshold`.
    pub relative_threshold: f64,
    /// Return at most this many peaks (strongest first).
    pub max_peaks: usize,
}

impl PeakOptions {
    /// The engine's defaults (matching the TS reference).
    pub fn new(bin_hz: f64) -> Self {
        Self {
            bin_hz,
            min_magnitude: 1e-4,
            relative_threshold: 0.01,
            max_peaks: 16,
        }
    }
}

/// Find spectral peaks: local maxima refined with parabolic interpolation.
pub fn detect_peaks(magnitudes: &[f32], opts: &PeakOptions) -> Vec<SpectralPeak> {
    let mut max = 0.0_f64;
    for &m in magnitudes {
        let m = m as f64;
        if m > max {
            max = m;
        }
    }
    let floor = opts.min_magnitude.max(max * opts.relative_threshold);

    let mut peaks = Vec::new();
    // Skip DC (bin 0) and Nyquist (last bin); neither is a meaningful peak.
    if magnitudes.len() >= 3 {
        for k in 1..magnitudes.len() - 1 {
            let m = magnitudes[k] as f64;
            if m < floor {
                continue;
            }
            let prev = magnitudes[k - 1] as f64;
            let next = magnitudes[k + 1] as f64;
            if m <= prev || m < next {
                continue;
            }

            // Parabolic interpolation in log magnitude. Offset is in
            // (-0.5, 0.5) bins; interpolated height is b - (a-c)*offset/4.
            let a = prev.max(1e-12).ln();
            let b = m.max(1e-12).ln();
            let c = next.max(1e-12).ln();
            let denom = a - 2.0 * b + c;
            let p = if denom == 0.0 {
                0.0
            } else {
                (0.5 * (a - c)) / denom
            };
            let offset = p.clamp(-0.5, 0.5);

            peaks.push(SpectralPeak {
                frequency_hz: (k as f64 + offset) * opts.bin_hz,
                magnitude: (b - 0.25 * (a - c) * offset).exp(),
                bin: k,
            });
        }
    }

    // Descending by magnitude; a stable sort matches JS's stable Array.sort for
    // equal magnitudes.
    peaks.sort_by(|x, y| y.magnitude.partial_cmp(&x.magnitude).unwrap());
    peaks.truncate(opts.max_peaks);
    peaks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_interpolated_peak_between_bins() {
        // Symmetric bump centered between bins 2 and 3 → offset ~ +0.5-ish.
        let mags = [0.0, 0.0, 1.0, 1.0, 0.0, 0.0];
        let peaks = detect_peaks(&mags, &PeakOptions::new(10.0));
        assert_eq!(peaks.len(), 1);
        assert_eq!(peaks[0].bin, 2);
        assert!(peaks[0].frequency_hz > 20.0 && peaks[0].frequency_hz < 30.0);
    }

    #[test]
    fn returns_strongest_first() {
        let mags = [0.0, 0.3, 0.0, 0.9, 0.0, 0.6, 0.0];
        let peaks = detect_peaks(&mags, &PeakOptions::new(1.0));
        let mags_out: Vec<f64> = peaks.iter().map(|p| p.magnitude).collect();
        assert!(mags_out.windows(2).all(|w| w[0] >= w[1]));
    }
}
