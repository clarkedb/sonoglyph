/**
 * Hand-written public types for @sonoglyph/dsp-wasm — the `types` entry, kept
 * separate from `main` (`src/index.ts`) on purpose. `src/index.ts` imports the
 * generated `pkg/`, which only exists after `build:wasm`; consumers must be
 * able to typecheck against this package without a Rust toolchain, so their
 * type resolution stops here. `src/index.ts` is itself typechecked against the
 * real bindings by the package's own `typecheck:wasm`; keep these in sync (the
 * surface is tiny and stable).
 */

/**
 * Instantiate the WASM module (idempotent). Await once before calling any
 * primitive. In the browser, call with no argument; in Node/tests, pass the
 * wasm bytes.
 */
export declare function initDspWasm(wasm?: BufferSource): Promise<void>;

export declare function goertzelMagnitude(
  samples: Float32Array,
  frequencyHz: number,
  sampleRate: number,
): number;

export declare function goertzelPower(
  samples: Float32Array,
  frequencyHz: number,
  sampleRate: number,
): number;
