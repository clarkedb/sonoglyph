/**
 * Stands in for @sonoglyph/dsp-wasm when its WASM artifact hasn't been built.
 * Aliased in by vite.config.ts so `pnpm dev`/`build` work with no Rust
 * toolchain. `initDspWasm` rejects, which the benchmark panel treats as
 * "WASM unavailable" and degrades to a hint. The primitives never run (the
 * panel only calls them after init resolves), but they throw for safety.
 */

const HINT = '@sonoglyph/dsp-wasm not built — run `pnpm --filter @sonoglyph/dsp-wasm build:wasm`';

export function initDspWasm(): Promise<void> {
  return Promise.reject(new Error(HINT));
}

export function goertzelMagnitude(): number {
  throw new Error(HINT);
}

export function goertzelPower(): number {
  throw new Error(HINT);
}

export const STREAM = { spectrum: 0, peaks: 1, envelope: 2, samples: 3 } as const;

// Panels only construct the engine after initDspWasm() resolves, which it never
// does here — so this constructor is unreachable, but throws for safety.
export class WasmDspEngine {
  constructor() {
    throw new Error(HINT);
  }
}
