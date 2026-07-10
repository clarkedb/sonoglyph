# Sonoglyph Roadmap

The plan is organized into phases, each ending at something demonstrable. Phases replace the original milestone framework; items within a phase are roughly ordered but not sacred. Architecture and rationale live in [architecture.md](./architecture.md).

**Status: Phase 1 built (2026-07-08).** All five workspace units exist; DTMF decodes end-to-end (verified in headless Chrome for the keypad/tone/WAV paths, including the full 16-key sequence, repeated digits, and rejection cases). Remaining before calling Phase 1 done: a human live-microphone check (hold a phone dialer up to the mic) and turning on branch protection once CI has run on GitHub.

## Phase 1 — Vertical slice

**Goal:** open the playground, grant microphone access, play DTMF tones, and watch audio flow through every visible stage of the pipeline until the recognized digit appears — with each stage inspectable enough to understand _why_ the recognizer decided what it did.

All TypeScript. No Rust, no website, no persistence.

### Workspace

Five units, and nothing else until a second consumer proves a boundary:

```
sonoglyph/
├── apps/
│   └── playground/        # Vite + React
├── packages/
│   ├── core/              # interfaces & types only
│   ├── dsp/               # TS reference DSP engine
│   └── browser/           # mic, AudioWorklet, ring buffer, WAV
├── plugins/
│   └── dtmf/
└── docs/
```

- pnpm workspaces; `@sonoglyph/*` npm scope from the start.
- TypeScript strict everywhere; ESLint + Prettier; Vitest.
- CI from the first commit (see [GitHub Actions](#github-actions)).

### 1.1 Interfaces on paper

Design the load-bearing contracts in `packages/core` before building against them:

- `Glyph` — symbol, plugin id, time span, confidence, typed payload.
- `FeatureFrame` / feature stream registry — named, versioned streams (`spectrum`, `peaks`, `envelope`); plugins declare `requiredStreams`.
- `RecognizerPlugin` — stateful stream consumer: `process(frame)` in, glyphs emitted asynchronously, `reset()`. Segmentation state lives in the plugin.
- `DspEngine` — samples in, feature frames out; configurable window size, hop, window function.
- `AudioSource` — microphone, WAV file, generated tones behind one interface.
- `PluginMetadata` — id, name, version, required streams. (Options schema deferred to the Phase 2 plugin SDK, where options handling lives.)

### 1.2 Browser audio

- Microphone permissions, `AudioContext`, AudioWorklet.
- The worklet is dumb: it ships 128-sample quanta into a ring buffer and nothing else. All DSP happens outside the worklet.
- Debug view: raw waveform, sample rate, buffer fill, latency. (Web Audio's `AnalyserNode` may serve as throwaway scaffolding here; it is deleted once our own spectrum view exists.)

### 1.3 DSP engine (TypeScript)

- Windowing (Hann at minimum; selectable — the window choice should be a visible, teachable knob).
- FFT (small dependency like `fft.js`, or hand-rolled radix-2 if it earns its educational keep).
- Magnitude spectrum → `spectrum` stream.
- Peak detection with parabolic interpolation → `peaks` stream.
- Amplitude envelope → `envelope` stream (cheap now, needed by Morse in Phase 2 — proves the multi-stream design isn't DTMF-shaped).
- Defaults tuned for DTMF: 48 kHz, 2048-sample window (~23 Hz bins — enough with parabolic peak interpolation), 512-sample hop. _Learned in implementation:_ the originally planned 4096 window smears every tone across ~85 ms, which bridges real inter-digit gaps and inflates short tones past the 40 ms minimum — time resolution matters as much as frequency resolution here. Feature frames carry their analysis span so recognizers can correct for the smear.
- Everything operates on plain `Float32Array`s and runs in Node — unit tests in Vitest against synthetic signals generated in code.

### 1.4 DTMF plugin

- Recognizes all 16 keys (0–9, \*, #, A–D) from the `peaks` stream.
- Tolerates realistic frequency deviation (±1.5% per ITU-T Q.24 as a starting point) and requires minimum tone duration (~40 ms) and inter-digit gaps — the debouncing state machine is the reference example of plugin segmentation.
- Emits glyphs with confidence and the detected frequency pair as payload.
- This plugin is the reference implementation future plugin authors read first; clarity beats cleverness.

### 1.5 Tone generator (requirement, not stretch goal)

- Synthetic DTMF keypad in the playground: press `5`, hear the tone, watch the glyph appear. This is the demo, the always-available test input, and the first educational moment in one — never blocked on having a phone handy.
- General-purpose tone generator (arbitrary frequencies/waveforms) for DSP debugging.

### 1.6 Playground assembly

Panels, each with a short embedded explainer (this is where educational content starts — as annotations on a live pipeline, not standalone articles):

- **Input** — microphone / tone generator / WAV upload.
- **Waveform** — live time domain.
- **Spectrum** — live FFT with hover cursor (exact frequency/amplitude); window size and function adjustable, so the resolution tradeoff is something you can _feel_.
- **Peaks** — detected peaks highlighted on the spectrum.
- **Features** — human-readable live feature frames.
- **Glyph timeline** — recognition history with timestamps, confidence, and payload (the "why did it decide that" view).

### 1.7 Testing

- Unit: window functions, FFT correctness against known transforms, peak detection, DTMF state machine.
- Integration: synthesize DTMF WAV data in code (every key, noise added, near-miss frequencies, too-short tones, back-to-back repeated digits) → feed through the exact pipeline the microphone uses → assert deterministic glyph output.
- No binary fixtures; all test signals generated.

**Phase 1 is done when:** live microphone DTMF and synthetic WAVs both decode reliably, every pipeline stage is visible in the playground, and CI is green on lint/typecheck/test/build.

## Phase 2 — Open it up

**Goal:** a stranger can build a plugin without reading framework internals.

- **Plugin SDK** (`packages/plugin-sdk`) — extracted from what the DTMF plugin proved it needs, not designed speculatively. Includes helpers so "dumb" per-frame classifiers get debouncing/segmentation for free (`defineRecognizer(...)`).
- **Plugin testing module** (`packages/plugin-sdk/testing` or `@sonoglyph/testing`) — so a plugin author can test recognition under realistic conditions in a few lines. Extract what the DTMF tests already grew by hand: signal builders composing on the `dsp` generators (tone sequences with per-key timing/deviation/twist, noise colors — white, pink, low-passed "fan rumble"), and a decode harness (signal → default pipeline in worklet-sized chunks → collected glyphs). The fan-noise regression (2026-07-08) is the motivating example: every noise scenario had to be hand-rolled inside `plugins/dtmf`'s test file.
- **Second DTMF recognizer: Goertzel.** Real-world DTMF decoders classically use the Goertzel algorithm (energy at 8 known frequencies, far cheaper than a full FFT). Shipping it alongside the FFT-based recognizer, with a playground toggle to compare them live, demonstrates that plugins own their recognition strategy — and makes a great educational comparison (general-purpose vs. purpose-built analysis).
- **Second signal system: Morse** (`plugins/morse`) — time-domain recognition off the `envelope` stream. This is the plugin that stress-tests segmentation and proves feature streams aren't DTMF-shaped. Dots, dashes, and letters are all glyphs; the letter/word translator exercises the Meaning layer non-trivially for the first time.
- **Plugin author documentation** — `docs/plugins.md` walkthrough: build a recognizer from scratch against `core` + `plugin-sdk`.
- **Publish** `@sonoglyph/*` packages to npm (versioning via Changesets; see below).
- Storage abstraction only if a plugin actually needs it by now — otherwise it waits.

## Phase 3 — Rust core

**Goal:** the original Rust/WASM ambition, landed on stable interfaces.

**Switch triggers — start this phase when any of these is true:**

1. A compute-bound workload arrives: high-resolution spectrograms, filter banks, MFCC-style extraction (birdsong/chords), polyphonic analysis (Rocky), or SDR-class sample rates.
2. Native targets get prioritized: CLI tools, Tauri desktop, Raspberry Pi/embedded.
3. The MVP is stable and it's time for the Rust learning arc on its own merits.

**Landed so far:** the Cargo workspace and pinned toolchain (`rust-toolchain.toml`), `crates/sonoglyph-dsp` with the Goertzel primitive ported and cross-validated against the golden vectors, a path-filtered `rust.yml` CI job, the WASM boundary — `@sonoglyph/dsp-wasm` (wasm-bindgen exports built with wasm-pack `--target web`) with a test asserting the WASM primitives match the TS reference, the playground **TS-vs-WASM benchmark panel** consuming it, and the **spectral primitives** — `crates/sonoglyph-fft` (a bit-exact radix-2 FFT abstraction) plus windowing, peak detection, and envelope in `sonoglyph-dsp`, cross-validated against the golden engine vectors (magnitudes, interpolated peaks, and envelope all match bit-for-bit — the `f32` storage in the reference absorbs cross-language transcendental ULP differences), and the **streaming engine** — a `DspEngine` port (buffer/hop framing, `push`/`reset`, stream time) that wraps those primitives, cross-validated against the golden engine vectors and its own framing/chunking-invariance tests. Approach: Rust is **additive, never required** — the TS engine stays the default, and the WASM package is skipped by the default TS gates (the playground even builds and runs without it, degrading the panel gracefully) so TS-only contributors need no Rust toolchain — until WASM becomes the default engine.

**Plan:**

- `crates/sonoglyph-dsp` implementing the same `DspEngine` contract: done — the spectral primitives and the streaming engine (`DspEngine`) are ported and cross-validated. `crates/sonoglyph-fft` is the FFT abstraction with two backends: the bit-exact hand-rolled radix-2 (holds the tight golden contract) and **rustfft** (numerically equivalent, ~2.8× faster on the full engine natively), selectable per engine and validated against the reference.
- wasm-bindgen + WASM build via wasm-pack into a `@sonoglyph/dsp-wasm` pnpm package — done for the primitives and the **streaming engine**, which crosses the boundary with a zero-copy input path (a reusable buffer in WASM memory rather than a per-call `Float32Array` copy) and is cross-validated against the TS engine live in the playground's engine benchmark. With the rustfft backend the WASM engine now runs faster than V8's JIT in the browser (~1.3× on plain WASM; WASM SIMD would widen it). Still open (not committed — see [issue #60](https://github.com/clarkedb/sonoglyph/issues/60)): whether to run the live recognition pipeline through the WASM engine and make it the default.
- **The TypeScript engine is kept**, permanently, as the readable reference implementation. Shared golden test vectors (`packages/dsp/src/golden`) cross-validate the two engines — the strongest correctness story DSP code can have.
- Playground benchmark panel: TS vs. WASM side by side, as an educational feature ("this is why WASM exists" — and, honestly, why it sometimes doesn't for small boundary-crossing probes). ✓ landed.
- Native `cargo test` + proptest (engine invariants: frame count/times, any-split chunking-invariance, reset) + criterion benches (radix-2 vs rustfft) — landed; thin WASM-boundary smoke tests in the browser CI job.
- WASM becomes the default engine in the browser; TS remains the fallback and the teaching text.

## Phase 4 — Education & website

**Goal:** the standalone learning resource, grown from battle-tested playground panels rather than written from scratch.

Two surfaces, one component library. The panels the playground grew are
extracted to `@sonoglyph/react` (done, PR #50) so both consumers render one
source of truth, styled through the token contract (`@sonoglyph/react/theme.css`).
The playground has converged onto the website's dark "instrument at night"
palette (void + phosphor amber, Barlow/Barlow Condensed/Fragment Mono,
matching favicon) — the website itself doesn't consume `@sonoglyph/react`
yet, so the printed (light) theme and a runtime toggle in the playground
remain deferred until that embed happens.

- **Next.js site (`website/`) at `sonoglyph.dev`**: the teaching/marketing
  surface — project introduction, the **Learn** section, focused hosted
  examples, developer docs. Design language: the dark instrument-manual
  system (see `website/PRODUCT.md`).
- **Full playground (`apps/playground`, Vite) at `play.sonoglyph.dev`**: the
  kitchen-sink interactive tool, deployed separately (its own Vercel project)
  rather than ported into Next — no `AudioWorklet`/controller migration, and
  the site never needed the whole app inline. The site's "open the playground"
  CTA links here.
- **Learn** section (in the site) — articles promoted from the playground's
  embedded explainers, each embedding its `@sonoglyph/react` component
  directly: sound & sampling, Nyquist, FFT & windowing (the resolution
  tradeoff), harmonics, peak detection, feature extraction, "building a
  recognizer" end-to-end, DTMF history & why it works, FFT vs. Goertzel.
- **Hosted examples** (in the site, built from `@sonoglyph/react`): focused
  DTMF decoder, Morse decoder, tone playground — smaller than the full tool.
- Deployment via CI / Vercel (see below).

## Beyond

Unordered, unpromised: chords and MIDI plugins, birdsong (probabilistic recognition), the Rocky plugin (polyphonic language, teaching mode, dictionary persistence — the _Project Hail Mary_ origin story, now sketched as the [Hail Mary milestone](https://github.com/clarkedb/sonoglyph/milestone/5): Eridian language spec, recognizer plugin, and themed website experiences including Grace's realtime translator console), storage providers (IndexedDB/SQLite-WASM), community plugin registry, Tauri desktop app, native CLI, SDR input sources.

## GitHub Actions

### Now (lands with Phase 1 scaffolding)

`ci.yml` — on every PR and push to `main`:

| Job     | Steps                                                                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`  | checkout → pnpm + Node (versions pinned via `packageManager` / `.nvmrc`, pnpm store cache) → `pnpm install --frozen-lockfile` → `pnpm lint` (ESLint + Prettier check) → `pnpm typecheck` |
| `test`  | same setup → `pnpm test` (Vitest)                                                                                                                                                        |
| `build` | same setup → `pnpm build` (all packages + playground); `needs: [lint, test]`, so a green `build` means the whole pipeline passed                                                         |

`lint` and `test` run in parallel; `build` gates on both, so branch protection on `main` only needs to require `build`. Actions are pinned to release commit SHAs with the semantic tag as a comment; Dependabot keeps the pins fresh.

### Phase 2 — versioning & publishing

- **Changesets** for versioning: contributors add a changeset per change; a bot-maintained "Version Packages" PR accumulates them.
- `release.yml` — on merge of the version PR to `main`: build → publish `@sonoglyph/*` to npm with provenance → create GitHub release + tags.

### Phase 3 — Rust jobs

- `rust.yml` (separate from `ci.yml`, so the Rust checks stay independent of the TS pipeline's `build` gate): rustup provisions the toolchain from `rust-toolchain.toml`, then parallel jobs run `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, and a `wasm32` compile-check; a `rust` aggregation job gates them so branch protection requires one check (mirroring `build` in `ci.yml`). A browser smoke test against the WASM engine follows once the boundary exists.
- Path filters (`crates/**`, `Cargo.*`, `rust-toolchain.toml`, the workflow itself) so TS-only changes don't pay the Rust toolchain cost and vice versa. Cargo cache via `Swatinem/rust-cache`.

### Phase 4 — deployment

- Two Vercel projects on this repo, both with PR preview deployments:
  - `sonoglyph.dev` — the Next.js site (root `website/`).
  - `play.sonoglyph.dev` — the Vite playground (root `apps/playground`,
    output `dist/`). Build command is overridden via
    `apps/playground/vercel.json` to `cd ../.. && pnpm build:ci` — the
    Root Directory is `apps/playground`, but `build:ci` needs the whole
    workspace to provision Rust + wasm-pack and build `@sonoglyph/dsp-wasm`
    before the playground itself, so the plain per-package build command
    isn't enough once the WASM engine is part of the deploy (see
    `packages/dsp-wasm/README.md`). Vercel's Git integration handles
    build-on-push and previews, so no `deploy.yml` is needed unless a
    target outside Vercel (e.g. GitHub Pages)
    is later chosen.
