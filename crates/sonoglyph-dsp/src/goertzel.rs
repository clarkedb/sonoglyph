//! The Goertzel algorithm: signal energy at ONE known frequency, computed as
//! a two-tap recursive filter over the samples. Where an FFT answers "what
//! frequencies are present?" for ~N·log N work, Goertzel answers "how much of
//! frequency f is present?" for ~N multiplies — the classic choice when a
//! decoder already knows the handful of frequencies it cares about, as
//! real-world DTMF decoders do.
//!
//! A direct port of `packages/dsp/src/goertzel.ts`. Kept behavior-identical
//! on purpose, down to the DC/Nyquist quirk: at those extremes the recurrence
//! sits on the unit circle's real axis and the `2/N` normalization overstates
//! by 2×. That is not a bug to fix here — the reference does it, so the port
//! reproduces it, and the golden vectors pin it.

use std::f64::consts::PI;

/// Normalized magnitude of `frequency_hz` in the block: a full-scale sine at
/// that exact frequency measures ~1.0, matching the engine's spectrum
/// normalization. The frequency does not need to land on a bin.
pub fn goertzel_magnitude(samples: &[f32], frequency_hz: f64, sample_rate: f64) -> f64 {
    let n = samples.len();
    let coeff = 2.0 * (2.0 * PI * frequency_hz / sample_rate).cos();
    let mut s1 = 0.0_f64;
    let mut s2 = 0.0_f64;
    for &sample in samples {
        let s0 = sample as f64 + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    // |X|² for the final state; 2/N scales a full-scale in-bin sine to 1.
    let power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    (2.0 / n as f64) * power.max(0.0).sqrt()
}

/// Normalized power (magnitude squared). For an amplitude-A sine at the
/// measured frequency this is ~A².
pub fn goertzel_power(samples: &[f32], frequency_hz: f64, sample_rate: f64) -> f64 {
    let magnitude = goertzel_magnitude(samples, frequency_hz, sample_rate);
    magnitude * magnitude
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_RATE: f64 = 48_000.0;

    /// Mirror of `packages/dsp/src/generate.ts` `sine` (phase 0), producing
    /// the identical `Float32Array` the TS golden vectors are built from.
    fn sine(frequency_hz: f64, n: usize, amplitude: f64) -> Vec<f32> {
        let step = 2.0 * PI * frequency_hz / SAMPLE_RATE;
        (0..n)
            .map(|i| (amplitude * (step * i as f64).sin()) as f32)
            .collect()
    }

    /// Absolute tolerance = the cross-implementation contract (TOLERANCE in
    /// `packages/dsp/src/golden/vectors.ts`).
    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-5,
            "expected {expected}, got {actual} (|Δ| = {})",
            (actual - expected).abs()
        );
    }

    // The expected values below are the frozen outputs of the TS reference
    // (packages/dsp/src/golden/golden.json). Matching them here proves the
    // Rust primitive already cross-validates against TypeScript.

    #[test]
    fn tone_present_matches_golden() {
        // golden: goertzel/tone-present — sine 1209 Hz amp 0.8, 480 samples.
        let block = sine(1209.0, 480, 0.8);
        assert_close(goertzel_magnitude(&block, 1209.0, SAMPLE_RATE), 0.7948);
    }

    #[test]
    fn tone_absent_is_near_zero() {
        // golden: goertzel/tone-absent — probe 941 Hz in a 1209 Hz tone.
        let block = sine(1209.0, 480, 0.8);
        assert_close(goertzel_magnitude(&block, 941.0, SAMPLE_RATE), 0.091263);
    }

    #[test]
    fn off_grid_block_matches_golden() {
        // golden: goertzel/off-grid — 333-sample block, 1000 Hz not on the grid.
        let block = sine(1000.0, 333, 1.0);
        assert_close(goertzel_magnitude(&block, 1000.0, SAMPLE_RATE), 1.007634);
    }

    #[test]
    fn dc_overstates_by_two() {
        // golden: goertzel/dc — 0.5 DC block probed at 0 Hz reads 1.0 (the
        // documented 2× overstatement), not 0.5.
        let block = vec![0.5_f32; 256];
        assert_close(goertzel_magnitude(&block, 0.0, SAMPLE_RATE), 1.0);
    }

    #[test]
    fn nyquist_overstates_by_two() {
        // golden: goertzel/nyquist — alternating ±1 probed at 24 kHz reads 2.0.
        let block: Vec<f32> = (0..256)
            .map(|i| if i % 2 == 0 { 1.0 } else { -1.0 })
            .collect();
        assert_close(
            goertzel_magnitude(&block, SAMPLE_RATE / 2.0, SAMPLE_RATE),
            2.0,
        );
    }

    #[test]
    fn power_is_magnitude_squared() {
        let block = sine(1209.0, 480, 0.8);
        let mag = goertzel_magnitude(&block, 1209.0, SAMPLE_RATE);
        assert_close(goertzel_power(&block, 1209.0, SAMPLE_RATE), mag * mag);
    }
}
