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
  goertzelMagnitude as tsMagnitude,
  goertzelPower as tsPower,
  sine,
  tones,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type { SpectrumData } from '@sonoglyph/core';
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
});
