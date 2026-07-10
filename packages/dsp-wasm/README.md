# @sonoglyph/dsp-wasm

The Rust DSP core (`crates/sonoglyph-dsp`) compiled to WebAssembly. Exposes the
same primitives as `@sonoglyph/dsp`, by the same names, so a consumer can swap
the import. Part of the Rust/WASM engine work ([issue #16](https://github.com/clarkedb/sonoglyph/issues/16)).

## Build

```sh
pnpm --filter @sonoglyph/dsp-wasm build:wasm
```

Runs `wasm-pack build --target web` and writes the generated bindings + `.wasm`
to `pkg/` (git-ignored). Requires the Rust toolchain and `wasm-pack`; see the
repo's bootstrap notes. **This package is not part of the default TS gates** —
`pnpm typecheck` / `pnpm test` skip it when `pkg/` is absent, so a TS-only
contributor needs no Rust toolchain. It is built and checked in the `rust.yml`
CI job.

## Use

```ts
import { initDspWasm, goertzelMagnitude } from '@sonoglyph/dsp-wasm';

await initDspWasm(); // once; instantiates the WASM module
const level = goertzelMagnitude(samples, 1209, 48_000);
```

`initDspWasm()` hides the async instantiation so the primitives stay
synchronous. In the browser call it with no argument (the `.wasm` is fetched
relative to the module and fingerprinted by Vite); in Node/tests, pass the wasm
bytes.

## Cross-validation

`src/index.test.ts` asserts the WASM primitives match the `@sonoglyph/dsp`
TypeScript reference for the same inputs — the correctness story for keeping two
implementations. It runs only once `pkg/` is built.

## Zero-copy note

`goertzel*` take a `Float32Array` that wasm-bindgen copies into WASM memory per
call — fine for a probe. The streaming engine's hot loop will want a zero-copy
path (a view into pre-allocated WASM memory); that is deferred until the engine
port needs it.
