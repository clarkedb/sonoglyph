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
/* eslint-disable no-restricted-syntax */
import init, {
  DspEngine as RawEngine,
  goertzelMagnitude,
  goertzelPower,
  wasmMemory,
} from '../pkg/sonoglyph_dsp.js';
/* eslint-enable no-restricted-syntax */

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

export type WasmWindow = 'rectangular' | 'hann' | 'hamming' | 'blackman';
export type WasmStream = 'spectrum' | 'peaks' | 'envelope' | 'samples';
/** FFT backend: `'radix2'` is the bit-exact reference; `'rustfft'` is faster
 *  but only numerically equivalent (not bit-identical to the TS engine). */
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
export const STREAM = { spectrum: 0, peaks: 1, envelope: 2, samples: 3 } as const;

const WINDOW_CODE: Record<WasmWindow, number> = {
  rectangular: 0,
  hann: 1,
  hamming: 2,
  blackman: 3,
};
const STREAM_BIT: Record<WasmStream, number> = {
  spectrum: 0b0001,
  peaks: 0b0010,
  envelope: 0b0100,
  samples: 0b1000,
};

/**
 * The WASM streaming engine — the Rust `DspEngine` behind a clean interface.
 * `initDspWasm()` must have resolved first.
 *
 * Samples are copied once into a reusable WASM-side buffer per `push()` (no
 * per-call `Float32Array` allocation across the boundary). The frames from the
 * last `push()` are read back via the accessors until the next `push()`. Call
 * `free()` when done — this owns a WASM object.
 */
export class WasmDspEngine {
  #raw: RawEngine;
  #memory: WebAssembly.Memory;
  #capacity: number;

  constructor(options: WasmEngineOptions = {}) {
    const streams = options.streams ?? ['spectrum', 'peaks', 'envelope'];
    const mask = streams.reduce((m, s) => m | STREAM_BIT[s], 0);
    this.#raw = new RawEngine(
      options.sampleRate ?? 48_000,
      options.windowSize ?? 2048,
      options.hopSize ?? 512,
      WINDOW_CODE[options.window ?? 'hann'],
      mask,
      options.inputCapacity ?? 16_384,
      options.backend === 'rustfft' ? 1 : 0,
    );
    this.#memory = wasmMemory() as WebAssembly.Memory;
    this.#capacity = this.#raw.inputCapacity();
  }

  /** Max samples accepted by a single `push()`. */
  get inputCapacity(): number {
    return this.#capacity;
  }

  /**
   * Process up to `inputCapacity` samples; returns the number of frames
   * produced (readable via the accessors until the next `push()`).
   */
  push(samples: Float32Array): number {
    if (samples.length > this.#capacity) {
      throw new RangeError(`push of ${samples.length} exceeds input capacity ${this.#capacity}`);
    }
    // Re-derive the view each call: a WASM memory growth (from the engine's own
    // allocations) detaches any earlier view over `memory.buffer`.
    const view = new Float32Array(this.#memory.buffer, this.#raw.inputPtr(), this.#capacity);
    view.set(samples);
    return this.#raw.push(samples.length);
  }

  reset(): void {
    this.#raw.reset();
  }
  frameCount(): number {
    return this.#raw.frameCount();
  }
  frameStream(i: number): number {
    return this.#raw.frameStream(i);
  }
  spectrumMagnitudes(i: number): Float32Array {
    return this.#raw.spectrumMagnitudes(i);
  }
  envelopeRms(i: number): number {
    return this.#raw.envelopeRms(i);
  }
  envelopePeak(i: number): number {
    return this.#raw.envelopePeak(i);
  }
  /** Release the underlying WASM object. */
  free(): void {
    this.#raw.free();
  }
}
