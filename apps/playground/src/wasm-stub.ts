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
