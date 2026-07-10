/**
 * Headless performance benchmarks for the WASM engine — the CI-gated
 * counterpart of the interactive playground panel. Mirrors two of the TS
 * suite's benchmarks (`packages/dsp/bench/dsp.bench.ts`) so the WASM baseline
 * tracks the same workloads: the full engine push over ~1 s of audio and a
 * single Goertzel block. Compared against `bench-baselines/wasm.json` by the
 * CI gate (`.github/workflows/bench.yml`).
 *
 * Skipped unless `pkg/` has been built (`pnpm --filter @sonoglyph/dsp-wasm
 * build:wasm`), exactly like `../src/index.test.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bench, describe } from 'vitest';
import { goertzelPower, initDspWasm, WasmDspEngine } from '../src/index.ts';

const WASM_PATH = fileURLToPath(new URL('../pkg/sonoglyph_dsp_bg.wasm', import.meta.url));
const built = existsSync(WASM_PATH);

const SR = 48_000;

function tone(freqHz: number, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freqHz * i) / SR);
  return out;
}

// Top-level await, not `beforeAll`: tinybench begins timing before an async
// suite hook resolves, so the WASM module must be ready at import time.
if (built) await initDspWasm(readFileSync(WASM_PATH));

describe.skipIf(!built)('engine/push-1s', () => {
  const signal = tone(1000, 48_000);
  bench('rustfft', () => {
    const engine = new WasmDspEngine({
      sampleRate: SR,
      windowSize: 2048,
      hopSize: 512,
      backend: 'rustfft',
    });
    try {
      for (let off = 0; off < signal.length; off += engine.inputCapacity) {
        engine.push(signal.subarray(off, Math.min(off + engine.inputCapacity, signal.length)));
      }
    } finally {
      engine.free();
    }
  });
});

describe.skipIf(!built)('goertzel', () => {
  const block = tone(1209, 2048);
  bench('power-2048', () => {
    goertzelPower(block, 1209, SR);
  });
});
