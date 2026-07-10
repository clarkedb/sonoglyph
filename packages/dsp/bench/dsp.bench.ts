/**
 * Headless performance benchmarks for the TypeScript reference engine — the
 * CI-gated counterpart to the Rust `criterion` suite
 * (`crates/sonoglyph-dsp/benches/engine.rs`) and mirror of its shape, so the
 * two engines' baselines are comparable. Run with `vitest bench`; the CI gate
 * (`.github/workflows/bench.yml`) compares the results against the committed
 * `bench-baselines/ts.json` and fails on regression.
 *
 * These reuse the same exports the playground panels drive interactively
 * (`Fft`, `goertzelPower`, `TsDspEngine`, `tones`), just called headlessly.
 */

import { bench, describe } from 'vitest';
import { Fft, goertzelPower, TsDspEngine } from '@sonoglyph/dsp';

const SR = 48_000;

/** A steady tone; the FFT/engine cost is the same whatever the content. */
function tone(freqHz: number, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freqHz * i) / SR);
  return out;
}

describe('fft/magnitudes', () => {
  for (const size of [512, 2048, 8192]) {
    const signal = tone(1000, size);
    const fft = new Fft(size);
    bench(String(size), () => {
      fft.magnitudes(signal, 1);
    });
  }
});

describe('engine/push-1s', () => {
  // ~1 s of audio through the full engine (spectrum + peaks + envelope).
  const signal = tone(1000, 48_000);
  bench('ts', () => {
    new TsDspEngine({ sampleRate: SR, windowSize: 2048, hopSize: 512 }).push(signal);
  });
});

describe('goertzel', () => {
  const block = tone(1209, 2048);
  bench('power-2048', () => {
    goertzelPower(block, 1209, SR);
  });
});
