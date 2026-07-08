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
- `PluginMetadata` — id, name, version, required streams, options schema.

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

**Plan:**

- `crates/sonoglyph-dsp` implementing the same `DspEngine` contract; `crates/sonoglyph-fft` as the FFT abstraction (rustfft first, swappable per the original spec).
- wasm-bindgen + WASM build integrated into the Vite pipeline; boundary designed to avoid per-frame buffer copies.
- **The TypeScript engine is kept**, permanently, as the readable reference implementation. Shared golden test vectors cross-validate the two engines — the strongest correctness story DSP code can have.
- Playground benchmark panel: TS vs. WASM side by side, as an educational feature ("this is why WASM exists").
- Native `cargo test` + proptest + criterion benches; thin WASM-boundary smoke tests in the browser CI job.
- WASM becomes the default engine in the browser; TS remains the fallback and the teaching text.

## Phase 4 — Education & website

**Goal:** the standalone learning resource, grown from battle-tested playground panels rather than written from scratch.

- Next.js site (`website/`): project introduction, hosted playground, developer docs.
- **Learn** section — articles promoted from the playground's embedded explainers, each with its interactive component: sound & sampling, Nyquist, FFT & windowing (the resolution tradeoff), harmonics, peak detection, feature extraction, "building a recognizer" end-to-end walkthrough, DTMF history & why it works, FFT vs. Goertzel.
- Hosted examples: DTMF decoder, Morse decoder, tone playground.
- Deployment via CI (see below).

## Beyond

Unordered, unpromised: chords and MIDI plugins, birdsong (probabilistic recognition), the Rocky plugin (polyphonic language, teaching mode, dictionary persistence — the _Project Hail Mary_ origin story), storage providers (IndexedDB/SQLite-WASM), community plugin registry, Tauri desktop app, native CLI, SDR input sources.

## GitHub Actions

### Now (lands with Phase 1 scaffolding)

`ci.yml` — on every PR and push to `main`:

| Job  | Steps                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci` | checkout → pnpm + Node LTS (with pnpm store cache) → `pnpm install --frozen-lockfile` → `pnpm lint` (ESLint + Prettier check) → `pnpm typecheck` → `pnpm test` (Vitest) → `pnpm build` (all packages + playground) |

Keep it one job while the repo is small; split lint/test/build into parallel jobs when total time makes it worth it. Branch protection on `main` requires CI green.

### Phase 2 — versioning & publishing

- **Changesets** for versioning: contributors add a changeset per change; a bot-maintained "Version Packages" PR accumulates them.
- `release.yml` — on merge of the version PR to `main`: build → publish `@sonoglyph/*` to npm with provenance → create GitHub release + tags.

### Phase 3 — Rust jobs

- Add to `ci.yml`: Rust toolchain (with cargo cache) → `cargo fmt --check` → `cargo clippy -- -D warnings` → `cargo test` → wasm build → browser smoke test against the WASM engine.
- Path filters so TS-only changes don't pay the Rust toolchain cost and vice versa.

### Phase 4 — deployment

- `deploy.yml` — on push to `main`: build website + playground → deploy (Vercel or GitHub Pages; decide when the website exists). PR preview deployments for the playground once it's the primary review surface.
