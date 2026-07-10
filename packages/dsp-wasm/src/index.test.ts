/**
 * Cross-validation: the WASM primitives must agree with the `@sonoglyph/dsp`
 * TypeScript reference for the same inputs — the whole point of keeping both.
 * Inputs cover the golden edge cases (on-bin, absent, off-grid, DC, Nyquist).
 *
 * Skipped unless `pkg/` has been built (`pnpm --filter @sonoglyph/dsp-wasm
 * build:wasm`), so a TS-only `pnpm test` stays green without a Rust toolchain.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  concat,
  goertzelMagnitude as tsMagnitude,
  goertzelPower as tsPower,
  silence,
  sine,
  tones,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type {
  DspEngine,
  DspEngineOptions,
  EnvelopeData,
  FeatureFrame,
  PeaksData,
  SamplesData,
  SpectrumData,
} from '@sonoglyph/core';
import type * as DspWasm from './index.ts';

const WASM_PATH = fileURLToPath(new URL('../pkg/sonoglyph_dsp_bg.wasm', import.meta.url));
const built = existsSync(WASM_PATH);

const SR = 48_000;

function dc(n: number, value: number): Float32Array {
  return new Float32Array(n).fill(value);
}
function nyquistTone(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = i % 2 === 0 ? 1 : -1;
  return out;
}

const CASES: Array<[name: string, samples: Float32Array, frequencyHz: number]> = [
  ['on-bin 6000 Hz', sine(6000, 256 / SR, SR, 1), 6000],
  ['present 1209 Hz', sine(1209, 480 / SR, SR, 0.8), 1209],
  ['absent 941 Hz', sine(1209, 480 / SR, SR, 0.8), 941],
  ['off-grid 1000 Hz', sine(1000, 333 / SR, SR, 1), 1000],
  ['DC', dc(256, 0.5), 0],
  ['Nyquist', nyquistTone(256), SR / 2],
];

describe.skipIf(!built)('@sonoglyph/dsp-wasm ↔ @sonoglyph/dsp reference', () => {
  let wasm: typeof DspWasm;

  beforeAll(async () => {
    wasm = await import('./index.ts');
    await wasm.initDspWasm(readFileSync(WASM_PATH));
  });

  it.each(CASES)('%s: magnitude matches the TS reference', (_name, samples, frequencyHz) => {
    expect(wasm.goertzelMagnitude(samples, frequencyHz, SR)).toBeCloseTo(
      tsMagnitude(samples, frequencyHz, SR),
      9,
    );
  });

  it.each(CASES)('%s: power matches the TS reference', (_name, samples, frequencyHz) => {
    expect(wasm.goertzelPower(samples, frequencyHz, SR)).toBeCloseTo(
      tsPower(samples, frequencyHz, SR),
      9,
    );
  });

  it('streaming engine spectrum matches TsDspEngine', () => {
    // One DTMF-"1" window through both engines; the spectra must agree.
    const windowSize = 2048;
    const signal = tones(
      [
        { frequencyHz: 697, amplitude: 0.5 },
        { frequencyHz: 1209, amplitude: 0.5 },
      ],
      windowSize / SR,
      SR,
    );

    const ts = new TsDspEngine({ sampleRate: SR, windowSize, hopSize: windowSize });
    const tsSpectrum = ts.push(signal).find((f) => f.stream === 'spectrum')!.data as SpectrumData;

    const engine = new wasm.WasmDspEngine({ sampleRate: SR, windowSize, hopSize: windowSize });
    try {
      const count = engine.push(signal);
      expect(count).toBe(3); // spectrum, peaks, envelope
      const spectrumIndex = Array.from({ length: count }, (_, i) => i).find(
        (i) => engine.frameStream(i) === 0,
      )!;
      const wasmMags = engine.spectrumMagnitudes(spectrumIndex);

      expect(wasmMags.length).toBe(tsSpectrum.magnitudes.length);
      for (let k = 0; k < wasmMags.length; k++) {
        expect(Math.abs(wasmMags[k]! - tsSpectrum.magnitudes[k]!)).toBeLessThanOrEqual(1e-5);
      }
    } finally {
      engine.free();
    }
  });

  // The WasmDspEngineAdapter implements the full DspEngine contract, so it must
  // produce the same FeatureFrames as TsDspEngine — the fidelity guarantee the
  // playground toggle rests on. Uses the default rustfft backend (what runs
  // live): numerically equivalent, so magnitude-derived streams match to ~1e-5,
  // while envelope and the raw samples stream (FFT-independent) match exactly.
  const ADAPTER_OPTS: DspEngineOptions = {
    sampleRate: SR,
    windowSize: 2048,
    hopSize: 512,
    window: 'hann',
    streams: ['spectrum', 'peaks', 'envelope', 'samples'],
  };

  /** A multi-window DTMF-"5" chord (770 + 1336 Hz) — several hops, so the
   * comparison spans real streaming, not a single frame. */
  function dtmf5(): Float32Array {
    return tones(
      [
        { frequencyHz: 770, amplitude: 0.5 },
        { frequencyHz: 1336, amplitude: 0.5 },
      ],
      4096 / SR,
      SR,
    );
  }

  function assertFramesMatch(ts: FeatureFrame[], adapter: FeatureFrame[]): void {
    expect(adapter.length).toBe(ts.length);
    for (let i = 0; i < ts.length; i++) {
      const a = ts[i]!;
      const b = adapter[i]!;
      expect(b.stream).toBe(a.stream);
      expect(b.version).toBe(a.version);
      expect(b.time).toBeCloseTo(a.time, 9);
      expect(b.span).toBeCloseTo(a.span, 9);
      expect(b.hop).toBeCloseTo(a.hop, 9);
      if (a.stream === 'spectrum') {
        const am = (a.data as SpectrumData).magnitudes;
        const bm = (b.data as SpectrumData).magnitudes;
        expect(bm.length).toBe(am.length);
        for (let k = 0; k < am.length; k++) {
          expect(Math.abs(bm[k]! - am[k]!)).toBeLessThanOrEqual(1e-5);
        }
        expect((b.data as SpectrumData).binHz).toBeCloseTo((a.data as SpectrumData).binHz, 9);
        expect((b.data as SpectrumData).window).toBe((a.data as SpectrumData).window);
      } else if (a.stream === 'peaks') {
        const ap = (a.data as PeaksData).peaks;
        const bp = (b.data as PeaksData).peaks;
        expect(bp.length).toBe(ap.length);
        for (let k = 0; k < ap.length; k++) {
          // Sorted by descending magnitude in both, so index k aligns.
          expect(bp[k]!.frequencyHz).toBeCloseTo(ap[k]!.frequencyHz, 3);
          expect(bp[k]!.magnitude).toBeCloseTo(ap[k]!.magnitude, 4);
          expect(bp[k]!.bin).toBe(ap[k]!.bin);
        }
      } else if (a.stream === 'envelope') {
        // FFT-independent, so exact to f32 precision.
        expect((b.data as EnvelopeData).rms).toBeCloseTo((a.data as EnvelopeData).rms, 6);
        expect((b.data as EnvelopeData).peak).toBeCloseTo((a.data as EnvelopeData).peak, 6);
      } else if (a.stream === 'samples') {
        const as = (a.data as SamplesData).samples;
        const bs = (b.data as SamplesData).samples;
        expect(bs.length).toBe(as.length);
        // A verbatim copy of the analysis frame — bit-for-bit identical.
        for (let k = 0; k < as.length; k++) expect(bs[k]).toBe(as[k]);
      }
    }
  }

  function withAdapter(run: (engine: DspEngine & { free(): void }) => void): void {
    const engine = new wasm.WasmDspEngineAdapter(ADAPTER_OPTS);
    try {
      run(engine);
    } finally {
      engine.free();
    }
  }

  it('WasmDspEngineAdapter push() matches TsDspEngine frame-for-frame', () => {
    const signal = dtmf5();
    const tsFrames = new TsDspEngine(ADAPTER_OPTS).push(signal);
    // Also confirm the copy contract survives a later push: hold the first
    // samples frame, push more, and it must not change (the adapter copies the
    // WASM-side buffer out, like TsDspEngine).
    withAdapter((engine) => {
      const frames = engine.push(signal);
      const firstSamples = (frames.find((f) => f.stream === 'samples')!.data as SamplesData)
        .samples;
      const held = firstSamples.slice();
      assertFramesMatch(tsFrames, frames);
      engine.push(silence(0.1, SR));
      expect(firstSamples).toEqual(held);
    });
  });

  it('WasmDspEngineAdapter is chunking-invariant (small pushes ≡ one big push)', () => {
    const signal = dtmf5();
    const oneShot: FeatureFrame[] = [];
    const chunked: FeatureFrame[] = [];
    withAdapter((engine) => oneShot.push(...engine.push(signal)));
    withAdapter((engine) => {
      for (let off = 0; off < signal.length; off += 128) {
        chunked.push(...engine.push(signal.subarray(off, Math.min(off + 128, signal.length))));
      }
    });
    assertFramesMatch(oneShot, chunked);
  });

  it('WasmDspEngineAdapter flush() drains the tail like TsDspEngine', () => {
    // 2048 + 300 samples: one full window, then a short tail only flush emits.
    const signal = concat(dtmf5().subarray(0, 2048), sine(770, 300 / SR, SR, 0.5));
    const ts = new TsDspEngine(ADAPTER_OPTS);
    ts.push(signal);
    const tsDrained = ts.flush();
    expect(tsDrained.length).toBeGreaterThan(0);
    withAdapter((engine) => {
      engine.push(signal);
      assertFramesMatch(tsDrained, engine.flush());
      // Idempotent, matching the contract.
      expect(engine.flush()).toHaveLength(0);
    });
  });
});
