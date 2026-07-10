//! Per-frame spectral analysis: the composition the engine performs on each
//! analysis window — window the frame, FFT it, and read the envelope. Bit-exact
//! with `TsDspEngine.analyze` in `packages/dsp/src/engine.ts`.

use sonoglyph_fft::Fft;

/// Multiply a frame by a window, storing each product as `f32` (f64 math, f32
/// store — matching the reference's `Float32Array` intermediate).
pub fn apply_window(frame: &[f32], window: &[f32]) -> Vec<f32> {
    frame
        .iter()
        .zip(window)
        .map(|(&f, &w)| ((f as f64) * (w as f64)) as f32)
        .collect()
}

/// Windowed magnitude spectrum of a frame. `window_norm` is the window sum / 2,
/// so a full-scale windowed sine reads ~1.0.
pub fn spectrum_magnitudes(
    frame: &[f32],
    window: &[f32],
    window_norm: f64,
    fft: &dyn Fft,
) -> Vec<f32> {
    let windowed = apply_window(frame, window);
    fft.magnitudes(&windowed, window_norm)
}

/// Amplitude envelope of a frame (computed on the raw, unwindowed samples).
#[derive(Clone, Copy, Debug)]
pub struct Envelope {
    /// Root-mean-square amplitude of the frame.
    pub rms: f64,
    /// Largest absolute sample value in the frame.
    pub peak: f64,
}

/// Compute the [`Envelope`] of a frame.
pub fn envelope(frame: &[f32]) -> Envelope {
    let mut sum_sq = 0.0_f64;
    let mut peak = 0.0_f64;
    for &s in frame {
        let s = s as f64;
        sum_sq += s * s;
        let abs = s.abs();
        if abs > peak {
            peak = abs;
        }
    }
    Envelope {
        rms: (sum_sq / frame.len() as f64).sqrt(),
        peak,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::window::{make_window, window_sum, WindowName};
    use sonoglyph_fft::RadixTwoFft;
    use std::f64::consts::PI;

    #[test]
    fn full_scale_sine_reads_near_one() {
        let n = 256;
        // Sine exactly on bin 32 (6000 Hz at 48 kHz).
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 32.0 * i as f64 / n as f64).sin() as f32)
            .collect();
        let window = make_window(WindowName::Hann, n);
        let norm = window_sum(&window) / 2.0;
        let mags = spectrum_magnitudes(&signal, &window, norm, &RadixTwoFft::new(n));
        let max = mags.iter().cloned().fold(0.0f32, f32::max) as f64;
        assert!(max > 0.9 && max < 1.1, "max magnitude {max}");
    }

    #[test]
    fn envelope_of_full_scale_sine() {
        let n = 1024;
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 40.0 * i as f64 / n as f64).sin() as f32)
            .collect();
        let env = envelope(&signal);
        assert!((env.rms - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-2);
        assert!((env.peak - 1.0).abs() < 1e-2);
    }
}
