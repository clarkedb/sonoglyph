# @sonoglyph/dsp-wasm

The Rust DSP core (`crates/sonoglyph-dsp`) compiled to WebAssembly. Exposes the
same primitives as `@sonoglyph/dsp`, by the same names, so a consumer can swap
the import. Part of the Rust/WASM engine work ([issue #16](https://github.com/clarkedb/sonoglyph/issues/16)).

## Build

`pnpm build` (or `pnpm --filter @sonoglyph/dsp-wasm build`) builds this
package as part of the normal workspace build via `scripts/build.sh`: when
`cargo` and `wasm-pack` are on `PATH`, it runs `wasm-pack build --target web`
and writes the generated bindings + `.wasm` to `pkg/` (git-ignored); otherwise
it skips with a message and the playground falls back to its stub
(`apps/playground/src/wasm-stub.ts`). This is what lets any environment that
provisions the Rust toolchain — a dev machine, CI, or a hosting platform's
build step — end up with the real WASM engine from the same `pnpm build` used
everywhere else, with no separate manual step or platform-specific config.

For a deploy environment that doesn't provision Rust itself (a hosting
platform's default Node build image, for instance) and should still ship the
real WASM engine rather than degrade to the stub, `pnpm build:ci` at the repo
root runs `@sonoglyph/dsp-wasm`'s `build:ci` script first: it installs rustup
(toolchain pinned by `rust-toolchain.toml`) and `wasm-pack` via their official
installers when missing, then builds, then runs the normal `pnpm build`.
Point that platform's build command at `pnpm build:ci` instead of `pnpm build`
— nothing in either script is specific to any one platform. This is slower on
a cold environment (installing the toolchain plus a from-scratch compile) so
it's opt-in rather than the default.

To build (or rebuild) just this package explicitly, bypassing both the
availability check and the auto-install:

```sh
pnpm --filter @sonoglyph/dsp-wasm build:wasm
```

Requires the Rust toolchain and `wasm-pack`; see the repo's bootstrap notes.
**This package is not part of the default TS gates** — `pnpm typecheck` /
`pnpm test` skip it when `pkg/` is absent, so a TS-only contributor needs no
Rust toolchain. `rust.yml`'s CI job always has the toolchain, so it calls
`build:wasm` directly to fail loudly on a real build error rather than skip.

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
