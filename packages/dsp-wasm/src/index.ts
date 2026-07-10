/**
 * @sonoglyph/dsp-wasm — the Rust DSP core (`crates/sonoglyph-dsp`) compiled to
 * WebAssembly. The exported primitives mirror the `@sonoglyph/dsp` API by name,
 * so a consumer can swap one package for the other by changing the import.
 *
 * The primitives are synchronous, but WASM instantiation is not: call
 * `initDspWasm()` once and await it before calling anything else. That async
 * step lives here so the rest of the app sees a synchronous API.
 */

// wasm-pack emits real `.js` glue with no `.ts` source, so this import is a
// genuine `.js` specifier — the one case the repo's no-`.js`-import rule can't cover.
// eslint-disable-next-line no-restricted-syntax
import init, { goertzelMagnitude, goertzelPower } from '../pkg/sonoglyph_dsp.js';

let ready: Promise<void> | undefined;

/**
 * Instantiate the WASM module (idempotent — safe to call repeatedly). In the
 * browser, call with no argument: the `.wasm` is fetched relative to this
 * module, and Vite fingerprints it as an asset. In Node/tests, pass the wasm
 * bytes directly.
 */
export function initDspWasm(wasm?: BufferSource): Promise<void> {
  ready ??= init({
    module_or_path: wasm ?? new URL('../pkg/sonoglyph_dsp_bg.wasm', import.meta.url),
  }).then(() => undefined);
  return ready;
}

export { goertzelMagnitude, goertzelPower };
