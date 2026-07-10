//! Property tests: invariants the streaming engine must hold for *any* input
//! and configuration, not just the fixed golden vectors.

use proptest::prelude::*;
use sonoglyph_dsp::{DspEngine, EngineOptions, FrameData, Stream, WindowName};

const SR: f64 = 48_000.0;

/// A power-of-two window in [256, 4096] paired with a hop in [1, window].
fn config() -> impl Strategy<Value = (usize, usize)> {
    (8u32..=12).prop_flat_map(|bits| {
        let window = 1usize << bits;
        (Just(window), 1usize..=window)
    })
}

/// Up to ~0.4 s of samples in [-1, 1] — enough to span several windows at any
/// tested size while keeping the fuzz run quick.
fn samples() -> impl Strategy<Value = Vec<f32>> {
    prop::collection::vec(-1.0f32..=1.0f32, 0..20_000)
}

proptest! {
    // Keep the suite fast for CI; each case builds and drains engines.
    #![proptest_config(ProptestConfig { cases: 96, ..ProptestConfig::default() })]

    /// A window of size W with hop H over N samples yields ⌊(N−W)/H⌋+1
    /// spectrum frames when N ≥ W, else none — and frame times are exactly
    /// k·H/sr.
    #[test]
    fn frame_count_and_times((window, hop) in config(), input in samples()) {
        let mut engine = DspEngine::new(EngineOptions {
            sample_rate: SR,
            window_size: window,
            hop_size: hop,
            window: WindowName::Hann,
            streams: vec![Stream::Spectrum],
        });
        let frames = engine.push(&input);

        let expected = if input.len() >= window { (input.len() - window) / hop + 1 } else { 0 };
        prop_assert_eq!(frames.len(), expected);

        for (k, frame) in frames.iter().enumerate() {
            prop_assert!((frame.time - (k * hop) as f64 / SR).abs() < 1e-9);
        }
    }

    /// Chunking invariance: splitting the input into arbitrary chunks and
    /// pushing them one by one produces byte-identical spectra to one push.
    #[test]
    fn chunking_invariant((window, hop) in config(), input in samples(), chunk in 1usize..4096) {
        let opts = || EngineOptions {
            sample_rate: SR,
            window_size: window,
            hop_size: hop,
            window: WindowName::Hann,
            streams: vec![Stream::Spectrum],
        };

        let mut whole = DspEngine::new(opts());
        let whole_frames = whole.push(&input);

        let mut chunked = DspEngine::new(opts());
        let mut chunked_frames = Vec::new();
        for piece in input.chunks(chunk) {
            chunked_frames.extend(chunked.push(piece));
        }

        prop_assert_eq!(whole_frames.len(), chunked_frames.len());
        for (a, b) in whole_frames.iter().zip(&chunked_frames) {
            prop_assert!((a.time - b.time).abs() < 1e-9);
            if let (FrameData::Spectrum(x), FrameData::Spectrum(y)) = (&a.data, &b.data) {
                prop_assert_eq!(&x.magnitudes, &y.magnitudes);
            }
        }
    }

    /// reset() returns the engine to a fresh state: the next push starts at
    /// time 0 and matches a brand-new engine.
    #[test]
    fn reset_is_a_fresh_start((window, hop) in config(), warmup in samples(), input in samples()) {
        let opts = || EngineOptions {
            sample_rate: SR,
            window_size: window,
            hop_size: hop,
            window: WindowName::Hann,
            streams: vec![Stream::Spectrum],
        };

        let mut reused = DspEngine::new(opts());
        reused.push(&warmup);
        reused.reset();
        let after_reset = reused.push(&input);

        let mut fresh = DspEngine::new(opts());
        let fresh_frames = fresh.push(&input);

        prop_assert_eq!(after_reset.len(), fresh_frames.len());
        for (a, b) in after_reset.iter().zip(&fresh_frames) {
            prop_assert!((a.time - b.time).abs() < 1e-12);
        }
    }
}
