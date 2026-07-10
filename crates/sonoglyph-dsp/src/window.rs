//! Window functions — a bit-exact port of `packages/dsp/src/window.ts`.
//!
//! An FFT assumes its input repeats forever; a raw slice almost never lines up
//! with itself, and the discontinuity smears energy across the spectrum
//! ("spectral leakage"). Tapering the slice to zero at the edges removes the
//! discontinuity at the cost of widening each spectral peak.

use std::f64::consts::PI;

/// Window functions the engine offers.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum WindowName {
    Rectangular,
    Hann,
    Hamming,
    Blackman,
}

/// One window sample. `i` in [0, n), periodic form (denominator n). Computed in
/// f64; the caller stores it as `f32`.
fn window_sample(name: WindowName, i: usize, n: usize) -> f64 {
    let x = (2.0 * PI * i as f64) / n as f64;
    match name {
        WindowName::Rectangular => 1.0,
        WindowName::Hann => 0.5 - 0.5 * x.cos(),
        WindowName::Hamming => 0.54 - 0.46 * x.cos(),
        WindowName::Blackman => 0.42 - 0.5 * x.cos() + 0.08 * (2.0 * x).cos(),
    }
}

/// Build a window of length `size`.
pub fn make_window(name: WindowName, size: usize) -> Vec<f32> {
    (0..size)
        .map(|i| window_sample(name, i, size) as f32)
        .collect()
}

/// Sum of the window's samples — used to normalize FFT magnitudes so a
/// full-scale sine reads ~1.0 regardless of window choice.
pub fn window_sum(window: &[f32]) -> f64 {
    window.iter().map(|&w| w as f64).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangular_is_all_ones() {
        assert_eq!(make_window(WindowName::Rectangular, 4), vec![1.0; 4]);
        assert!((window_sum(&make_window(WindowName::Rectangular, 8)) - 8.0).abs() < 1e-12);
    }

    #[test]
    fn hann_tapers_to_zero_at_the_start() {
        let w = make_window(WindowName::Hann, 16);
        assert!((w[0] as f64).abs() < 1e-12);
    }
}
