//! Benchmarks quantifying the two FFT backends — the numbers behind the
//! "bit-exact reference vs rustfft" tradeoff. Native only (`cargo bench`).

use std::f64::consts::PI;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use sonoglyph_dsp::{goertzel_power, DspEngine, EngineOptions, Stream, WindowName};
use sonoglyph_fft::{Fft, FftBackend, RadixTwoFft, RustFftBackend};

const SR: f64 = 48_000.0;

fn tone(freq: f64, n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| (2.0 * PI * freq * i as f64 / SR).sin() as f32)
        .collect()
}

fn bench_fft(c: &mut Criterion) {
    let mut group = c.benchmark_group("fft/magnitudes");
    for size in [512usize, 2048, 8192] {
        let signal = tone(1000.0, size);
        let radix = RadixTwoFft::new(size);
        let rust = RustFftBackend::new(size);
        group.bench_with_input(BenchmarkId::new("radix2", size), &size, |b, _| {
            b.iter(|| radix.magnitudes(&signal, 1.0))
        });
        group.bench_with_input(BenchmarkId::new("rustfft", size), &size, |b, _| {
            b.iter(|| rust.magnitudes(&signal, 1.0))
        });
    }
    group.finish();
}

fn bench_engine(c: &mut Criterion) {
    // ~1 s of audio through the full engine (spectrum + peaks + envelope).
    let signal = tone(1000.0, 48_000);
    let opts = || EngineOptions {
        sample_rate: SR,
        window_size: 2048,
        hop_size: 512,
        window: WindowName::Hann,
        streams: vec![Stream::Spectrum, Stream::Peaks, Stream::Envelope],
    };

    let mut group = c.benchmark_group("engine/push-1s");
    group.bench_function("radix2", |b| {
        b.iter(|| DspEngine::with_backend(opts(), FftBackend::RadixTwo).push(&signal))
    });
    group.bench_function("rustfft", |b| {
        b.iter(|| DspEngine::with_backend(opts(), FftBackend::RustFft).push(&signal))
    });
    group.finish();
}

fn bench_goertzel(c: &mut Criterion) {
    let block = tone(1209.0, 2048);
    c.bench_function("goertzel/power-2048", |b| {
        b.iter(|| goertzel_power(&block, 1209.0, SR))
    });
}

criterion_group!(benches, bench_fft, bench_engine, bench_goertzel);
criterion_main!(benches);
