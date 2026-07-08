# Sonoglyph Architecture

Sonoglyph is a browser-first, extensible signal recognition framework. It separates the general problem of digital signal processing from the domain-specific problem of understanding what signals _mean_. The DSP engine never knows whether it is analyzing telephone tones, Morse code, musical chords, birdsong, or a fictional alien language — it transforms raw signals into reusable features, and plugins interpret those features according to their own rules.

This document describes the high-level architecture. The phased implementation plan lives in [roadmap.md](./roadmap.md).

## The pipeline

Everything in Sonoglyph is organized around one conceptual pipeline:

```
Samples  →  Features  →  Glyphs  →  Meaning
```

| Stage        | Produced by                                          | Consumed by               | Example (DTMF)                                        |
| ------------ | ---------------------------------------------------- | ------------------------- | ----------------------------------------------------- |
| **Samples**  | Audio sources (microphone, WAV file, tone generator) | DSP engine                | 48 kHz float PCM                                      |
| **Features** | DSP engine                                           | Recognizer plugins        | Spectrum frames, detected peaks at 697 Hz and 1209 Hz |
| **Glyphs**   | Recognizer plugins                                   | Translators, timeline, UI | The digit `1`, with time span and confidence          |
| **Meaning**  | Translators                                          | Applications              | A dialed phone number                                 |

Visualization components observe every stage without influencing any of them. Each stage is independently replaceable, and each boundary is a stable, documented interface.

### Glyphs

A **glyph** is the symbolic representation of any recognized signal — the framework's central abstraction. A DTMF `5`, a Morse dash, a C-major chord, and a syllable of Rocky's language are all glyphs: a symbol with a time span, a confidence, and plugin-defined detail.

```ts
// Illustrative — final signatures are a Phase 1 deliverable.
interface Glyph<P = unknown> {
  symbol: string; // "5", "-", "Cmaj", "♪♫"
  pluginId: string; // which recognizer emitted it
  start: number; // seconds, in stream time
  duration: number; // seconds
  confidence: number; // 0..1
  payload?: P; // plugin-defined (e.g. the detected frequencies)
}
```

Recognizer plugins have exactly one job: emit glyphs from feature streams. Translators have exactly one job: map glyph sequences to meaning. For a simple plugin like DTMF the translator is nearly trivial (digit sequence → dialed number); for a language plugin it may involve dictionaries, grammar, and statistical matching. The layer exists either way.

### Named feature streams

There is no single canonical "feature vector." Different signal systems need fundamentally different features — DTMF wants dominant frequency pairs, Morse wants an amplitude envelope over time, chords want harmonic relationships. Forcing one shape onto all of them produces either a kitchen-sink union or a lowest common denominator that plugins bypass.

Instead, the DSP engine produces **named, versioned feature streams**:

| Stream                                  | Contents                                                  | Primary consumers                             |
| --------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `spectrum`                              | Windowed FFT magnitudes per frame                         | Visualizations, most frequency-domain plugins |
| `peaks`                                 | Detected spectral peaks (frequency, amplitude, sharpness) | DTMF, chords, pitch-based plugins             |
| `envelope`                              | Amplitude envelope over time                              | Morse, rhythm-based plugins                   |
| _(future)_ `pitch`, `chroma`, `mfcc`, … | Added as plugins need them                                | Chords, birdsong, Rocky                       |

Plugins declare which streams they require in their metadata, and the pipeline delivers each stream's frames only to the plugins that declared it. (Which extractors _run_ is engine configuration today; deriving it from the active plugins' declarations is planned for when plugin sets become dynamic.) Each stream carries a schema version so streams can evolve without breaking existing plugins.

```ts
// Illustrative.
interface FeatureFrame<T = unknown> {
  stream: string; // "spectrum" | "peaks" | "envelope" | ...
  version: number; // schema version of this stream
  time: number; // frame start, seconds in stream time
  span: number; // seconds of signal the frame describes (analysis window)
  hop: number; // seconds between frames
  data: T; // stream-specific payload
}
```

### Recognizer plugins are stateful stream consumers

Recognition is rarely a per-frame classification. DTMF needs debouncing (a tone must persist ~40 ms; a repeated digit needs a silence gap between events). Morse is _entirely_ about durations of on/off states. So the plugin contract is push-in, emit-out:

```ts
// Illustrative.
interface RecognizerPlugin {
  metadata: PluginMetadata; // id, name, version, requiredStreams (options schema arrives with the Phase 2 plugin SDK)
  process(frame: FeatureFrame): void; // called for each frame of a required stream
  onGlyph(cb: (glyph: Glyph) => void): Unsubscribe;
  reset(): void; // clear internal state (e.g. on source change)
}
```

Plugins own their segmentation state and emit glyphs asynchronously, whenever they have enough evidence. The plugin SDK will provide helpers so that "dumb" plugins (pure per-frame classifiers) can be written as a single function and get debouncing for free.

## Layers and packages

```
apps/playground          Interactive analysis environment (Vite + React)
        │
plugins/dtmf, ...        Recognizers + translators (consume core interfaces only)
        │
packages/browser         Microphone, AudioWorklet, ring buffer, WAV loading
packages/dsp             DSP engine (windowing, FFT, peak detection, extractors)
                         + the Pipeline runner that wires an engine to plugins
        │
packages/core            Interfaces & types only: Glyph, FeatureFrame,
                         RecognizerPlugin, DspEngine, AudioSource. No browser code.
```

Rules that keep the layers honest:

- `core` has **zero dependencies** and no browser APIs. It is the contract everyone shares.
- `dsp` depends only on `core` and operates on plain `Float32Array`s — it runs identically in the browser, in a Worker, and in Node (which is what makes it testable in Vitest).
- Plugins depend only on `core` (and eventually `plugin-sdk`). A plugin author never imports from `dsp` or `browser` in plugin code. (Plugin _tests_ currently use `dsp` as a devDependency to drive the real pipeline; the Phase 2 testing module absorbs that.)
- Visualization reads from the pipeline through the same event interfaces as everything else; it can never influence recognition.
- The repo structure serves the project — packages are split only when a second consumer proves the boundary. `plugin-sdk`, `react`, `storage`, etc. are extracted later, from working code, not scaffolded up front.

## Audio path in the browser

```
getUserMedia → AudioContext → AudioWorklet (dumb: ships 128-sample
quanta into a ring buffer) → Worker or main thread: windowing → FFT →
extractors → feature streams → plugins → glyphs → UI
```

The AudioWorklet deliberately does **no DSP**. Worklet scope makes WASM loading and debugging painful, and nothing in the current scope is latency-sensitive enough to need in-worklet processing (DTMF tolerates tens of milliseconds easily). The worklet's only job is moving samples out reliably. This also keeps the entire DSP path runnable outside a live AudioContext, which is what makes deterministic testing possible: integration tests feed synthetic WAV data through the exact pipeline the microphone uses.

A physics note that drives the defaults: DTMF's low-group frequencies are 73 Hz apart (697/770/852/941 Hz). At 48 kHz, cleanly separating them needs an FFT of at least 2048 samples (~23 Hz bins); 4096 (~12 Hz bins) is comfortable. That's a 43–85 ms analysis window — the window-size vs. frequency-resolution vs. time-resolution tradeoff is _the_ central DSP tradeoff, and the playground should make it visible and adjustable.

## DSP engine: TypeScript now, Rust/WASM later

The DSP engine is implemented in **TypeScript** for the MVP, behind the `DspEngine` interface defined in `core`. This is a deliberate sequencing decision, not an abandonment of the original Rust/WASM goal.

**Why TypeScript first:**

- Nothing in the current scope is compute-bound. At 48 kHz with a 4096-sample window and 50% hop, the pipeline runs ~23 FFTs per second; a 4096-point FFT takes tens of microseconds in JavaScript. The engine idles >99% of the time.
- The Rust/WASM toolchain (wasm-bindgen, bundler integration, boundary memory management, CI toolchains) is the single largest source of build complexity in the original plan, and it would sit in front of the first working demo.
- A readable TypeScript DSP implementation directly serves the educational mission: learners and plugin authors can read the windowing function in the language they already know.
- Interfaces should stabilize against working code before a second implementation is added.

**Why AnalyserNode (Web Audio's built-in FFT) is not the engine:** it's a black box — fixed Blackman window, magnitudes only, pull-based polling with no deterministic frame alignment, unusable outside a live AudioContext and therefore untestable in Node. It may appear briefly as a day-one debug scaffold and is then deleted.

**Why Rust/WASM is still coming (Phase 3):**

1. **Native targets.** The project's future includes CLI tools, Tauri desktop apps, Raspberry Pi/embedded deployments, and SDR — a TypeScript core serves none of these; a Rust core serves all of them from one codebase.
2. **Performance headroom.** SDR sample rates (MHz instead of kHz), high-resolution spectrograms, filter banks, and MFCC-style feature extraction for birdsong/chords will eventually be compute-bound in ways DTMF never is.
3. **Cross-platform determinism.** Bit-identical numeric results in browser and native make shared golden test vectors trustworthy everywhere.
4. **Learning and identity.** Rust-powered browser DSP is part of the project's story, and learning Rust is an explicit project goal.

**What the switch looks like when it happens:** `crates/sonoglyph-dsp` implements the same `DspEngine` contract and is compiled to WASM. The TypeScript engine is **kept**, not replaced — it remains the readable reference implementation, and shared test vectors cross-validate the two (the strongest correctness story DSP code can have). A playground panel benchmarking TS vs. WASM side by side becomes an educational feature in its own right. Concrete switch triggers are listed in the [roadmap](./roadmap.md#phase-3--rust-core).

## Design principles

1. **Domain-agnostic core.** The DSP engine never knows what a signal means. If a change to `dsp` mentions DTMF, it belongs in a plugin or an extractor.
2. **Every stage observable.** Waveform, spectrum, peaks, feature frames, glyphs, and translations are all inspectable in the playground. Education is a first-class output, not documentation bolted on.
3. **Deterministic and testable.** The same bytes in produce the same glyphs out, in a browser or in CI. Synthetic test signals are generated in code, not stored as fixtures.
4. **Interfaces before implementations.** Plugins target `core`'s contracts; implementations behind those contracts (TS DSP → WASM DSP, memory storage → IndexedDB) are swappable.
5. **Split late.** Extract a package or crate when working code demonstrates the boundary, not before.
6. **Audio first, not audio only.** Nothing in `core` assumes audio. Streams of samples, features, and glyphs apply equally to SDR, vibration, and telemetry — future growth the abstractions should not foreclose.
