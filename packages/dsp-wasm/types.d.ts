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

export type WasmWindow = 'rectangular' | 'hann' | 'hamming' | 'blackman';
export type WasmStream = 'spectrum' | 'peaks' | 'envelope' | 'samples';
export type WasmFftBackend = 'radix2' | 'rustfft';

export interface WasmEngineOptions {
  sampleRate?: number;
  windowSize?: number;
  hopSize?: number;
  window?: WasmWindow;
  streams?: WasmStream[];
  /** Max samples per `push()`; longer signals must be chunked by the caller. */
  inputCapacity?: number;
  /** Defaults to `'radix2'` (bit-exact). Use `'rustfft'` for speed. */
  backend?: WasmFftBackend;
}

/** `frameStream()` codes. */
export declare const STREAM: {
  readonly spectrum: 0;
  readonly peaks: 1;
  readonly envelope: 2;
  readonly samples: 3;
};

/** The WASM streaming engine. `initDspWasm()` must have resolved first. */
export declare class WasmDspEngine {
  constructor(options?: WasmEngineOptions);
  /** Max samples accepted by a single `push()`. */
  get inputCapacity(): number;
  /** Process up to `inputCapacity` samples; returns the frame count. */
  push(samples: Float32Array): number;
  reset(): void;
  frameCount(): number;
  frameStream(i: number): number;
  spectrumMagnitudes(i: number): Float32Array;
  envelopeRms(i: number): number;
  envelopePeak(i: number): number;
  /** Release the underlying WASM object. */
  free(): void;
}
