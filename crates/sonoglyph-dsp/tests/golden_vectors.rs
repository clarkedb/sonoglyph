//! Cross-validate the Rust spectral pipeline against the shared golden vectors
//! (`packages/dsp/src/golden/golden.json`), the same fixture the TypeScript
//! engine is checked against. The inputs are regenerated here bit-for-bit from
//! the same recipes as `packages/dsp/src/golden/vectors.ts`; because every
//! value is stored as `f32`, that regeneration is exact across languages, so
//! the whole pipeline matches within the golden tolerance.

use serde_json::Value;
use sonoglyph_dsp::{
    detect_peaks, envelope, make_window, spectrum_magnitudes, window_sum, DspEngine, EngineOptions,
    FrameData, PeakOptions, Stream, WindowName,
};
use sonoglyph_fft::RadixTwoFft;
use std::f64::consts::PI;

const GOLDEN: &str = include_str!("../../../packages/dsp/src/golden/golden.json");
const SR: f64 = 48_000.0;
/// The golden contract's tolerance (TOLERANCE in vectors.ts). The frozen values
/// are rounded to 6 decimals, well inside this.
const TOL: f64 = 1e-5;

// --- Input generators: bit-exact ports of packages/dsp/src/generate.ts -------

/// Sum of sines; each `+=` rounds to `f32` between tones, like the reference's
/// `Float32Array` accumulation.
fn tones(specs: &[(f64, f64)], n: usize) -> Vec<f32> {
    let mut out = vec![0f32; n];
    for &(freq, amp) in specs {
        let step = 2.0 * PI * freq / SR;
        for (i, slot) in out.iter_mut().enumerate() {
            *slot = ((*slot as f64) + amp * (step * i as f64).sin()) as f32;
        }
    }
    out
}

fn sine(freq: f64, n: usize, amp: f64) -> Vec<f32> {
    tones(&[(freq, amp)], n)
}

fn silence(n: usize) -> Vec<f32> {
    vec![0f32; n]
}

/// Deterministic white noise (mulberry32), matching `generate.ts` exactly:
/// `>>> 0` is `u32` wrapping, `Math.imul` is `wrapping_mul`, and JS's
/// double-add-then-`^` equals `t ^ t.wrapping_add(..)`.
fn white_noise(n: usize, amp: f64, seed: u32) -> Vec<f32> {
    let mut state = seed;
    (0..n)
        .map(|_| {
            state = state.wrapping_add(0x6d2b79f5);
            let mut t = state;
            t = (t ^ (t >> 15)).wrapping_mul(t | 1);
            t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
            let r = ((t ^ (t >> 14)) as f64) / 4_294_967_296.0;
            (amp * (2.0 * r - 1.0)) as f32
        })
        .collect()
}

// --- The vectors, mirroring the engine vectors in vectors.ts -----------------

struct EngineVector {
    name: &'static str,
    window: WindowName,
    window_size: usize,
    input: Vec<f32>,
}

fn engine_vectors() -> Vec<EngineVector> {
    use WindowName::{Hann, Rectangular};
    vec![
        EngineVector {
            name: "engine/silence-hann-256",
            window: Hann,
            window_size: 256,
            input: silence(256),
        },
        EngineVector {
            name: "engine/sine-on-bin-hann-256",
            window: Hann,
            window_size: 256,
            input: sine(6000.0, 256, 1.0),
        },
        EngineVector {
            name: "engine/sine-off-bin-hann-256",
            window: Hann,
            window_size: 256,
            input: sine(6093.75, 256, 1.0),
        },
        EngineVector {
            name: "engine/sine-on-bin-rect-256",
            window: Rectangular,
            window_size: 256,
            input: sine(6000.0, 256, 1.0),
        },
        EngineVector {
            name: "engine/dtmf-1-hann-512",
            window: Hann,
            window_size: 512,
            input: tones(&[(697.0, 0.5), (1209.0, 0.5)], 512),
        },
        EngineVector {
            name: "engine/white-noise-rect-256",
            window: Rectangular,
            window_size: 256,
            input: white_noise(256, 0.5, 1),
        },
    ]
}

fn close(actual: f64, expected: f64, what: &str) {
    assert!(
        (actual - expected).abs() <= TOL,
        "{what}: expected {expected}, got {actual} (|Δ| = {})",
        (actual - expected).abs()
    );
}

#[test]
fn spectral_pipeline_matches_golden() {
    let golden: Value = serde_json::from_str(GOLDEN).unwrap();

    for v in engine_vectors() {
        let expected = &golden[v.name];
        assert!(expected.is_object(), "missing golden vector {}", v.name);

        let window = make_window(v.window, v.window_size);
        let norm = window_sum(&window) / 2.0;
        let fft = RadixTwoFft::new(v.window_size);
        let mags = spectrum_magnitudes(&v.input, &window, norm, &fft);
        let bin_hz = SR / v.window_size as f64;

        // Spectrum magnitudes.
        let golden_mags = expected["spectrum"]["magnitudes"].as_array().unwrap();
        assert_eq!(mags.len(), golden_mags.len(), "{}: bin count", v.name);
        for (k, (m, g)) in mags.iter().zip(golden_mags).enumerate() {
            close(
                *m as f64,
                g.as_f64().unwrap(),
                &format!("{} magnitudes[{k}]", v.name),
            );
        }

        // Peaks (parabolic-interpolated frequency + magnitude + bin index).
        let peaks = detect_peaks(&mags, &PeakOptions::new(bin_hz));
        let golden_peaks = expected["peaks"].as_array().unwrap();
        assert_eq!(peaks.len(), golden_peaks.len(), "{}: peak count", v.name);
        for (i, (p, g)) in peaks.iter().zip(golden_peaks).enumerate() {
            close(
                p.frequency_hz,
                g["frequencyHz"].as_f64().unwrap(),
                &format!("{} peak[{i}].freq", v.name),
            );
            close(
                p.magnitude,
                g["magnitude"].as_f64().unwrap(),
                &format!("{} peak[{i}].mag", v.name),
            );
            assert_eq!(
                p.bin as u64,
                g["bin"].as_u64().unwrap(),
                "{} peak[{i}].bin",
                v.name
            );
        }

        // Envelope.
        let env = envelope(&v.input);
        close(
            env.rms,
            expected["envelope"]["rms"].as_f64().unwrap(),
            &format!("{} rms", v.name),
        );
        close(
            env.peak,
            expected["envelope"]["peak"].as_f64().unwrap(),
            &format!("{} peak", v.name),
        );
    }
}

#[test]
fn engine_matches_golden() {
    let golden: Value = serde_json::from_str(GOLDEN).unwrap();

    for v in engine_vectors() {
        let expected = &golden[v.name];
        // The golden engine vectors push exactly one window (hop = window_size),
        // so the engine emits one frame per stream: spectrum, peaks, envelope.
        let mut engine = DspEngine::new(EngineOptions {
            sample_rate: SR,
            window_size: v.window_size,
            hop_size: v.window_size,
            window: v.window,
            streams: vec![Stream::Spectrum, Stream::Peaks, Stream::Envelope],
        });
        let frames = engine.push(&v.input);

        assert_eq!(
            frames.len() as u64,
            expected["frameCount"].as_u64().unwrap(),
            "{}: frame count",
            v.name
        );

        for frame in &frames {
            assert_eq!(frame.time, 0.0, "{}: single-window frame time", v.name);
            match &frame.data {
                FrameData::Spectrum(s) => {
                    let g = expected["spectrum"]["magnitudes"].as_array().unwrap();
                    assert_eq!(s.magnitudes.len(), g.len(), "{}: bins", v.name);
                    for (k, (m, gm)) in s.magnitudes.iter().zip(g).enumerate() {
                        close(
                            *m as f64,
                            gm.as_f64().unwrap(),
                            &format!("{} spectrum[{k}]", v.name),
                        );
                    }
                }
                FrameData::Peaks(p) => {
                    let g = expected["peaks"].as_array().unwrap();
                    assert_eq!(p.peaks.len(), g.len(), "{}: peaks", v.name);
                    for (i, (peak, gp)) in p.peaks.iter().zip(g).enumerate() {
                        close(
                            peak.frequency_hz,
                            gp["frequencyHz"].as_f64().unwrap(),
                            &format!("{} peak[{i}].freq", v.name),
                        );
                        close(
                            peak.magnitude,
                            gp["magnitude"].as_f64().unwrap(),
                            &format!("{} peak[{i}].mag", v.name),
                        );
                    }
                }
                FrameData::Envelope(e) => {
                    close(
                        e.rms,
                        expected["envelope"]["rms"].as_f64().unwrap(),
                        &format!("{} rms", v.name),
                    );
                    close(
                        e.peak,
                        expected["envelope"]["peak"].as_f64().unwrap(),
                        &format!("{} peak", v.name),
                    );
                }
                FrameData::Samples(_) => unreachable!("samples stream not requested"),
            }
        }
    }
}
