# sonoglyph

beep boop beep = hello world?

Sonoglyph is a browser-first, extensible signal recognition framework. It provides a reusable digital signal processing pipeline — microphone to spectrum to detected features — and a plugin architecture that turns those features into **glyphs**: symbolic representations of recognized signals. A DTMF `5`, a Morse dash, a musical chord, and a syllable of an alien language are all glyphs.

```
Samples  →  Features  →  Glyphs  →  Meaning
```

The core never knows what a signal means; plugins do. Every stage of the pipeline is observable, because the project is as much about _teaching_ signal processing as performing it. Inspired by the translator in _Project Hail Mary_, generalized into a platform for recognizing any structured signal system.

## Status

Phase 1 vertical slice built: DTMF decoding works end-to-end in the interactive playground — synthetic keypad, tone generator, WAV upload, and live microphone all flow through the same pipeline, with every stage visible. See the [roadmap](docs/roadmap.md) for what's next.

## Quick start

```bash
pnpm run bootstrap   # fresh clone/worktree: checks Node version, installs deps + git hooks
pnpm dev             # playground at http://localhost:5173
pnpm test            # unit + integration tests (all signals synthesized in code)
```

## Workspace

| Package                                | What it is                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`packages/core`](packages/core)       | Shared contracts: `Glyph`, `FeatureFrame`, `RecognizerPlugin`, `DspEngine`, `AudioSource`. Types only, zero dependencies. |
| [`packages/dsp`](packages/dsp)         | TypeScript reference DSP engine: windowing, radix-2 FFT, spectral peaks, envelope, and the pipeline runner.               |
| [`packages/browser`](packages/browser) | Browser audio: microphone capture via a dumb AudioWorklet, ring buffer, WAV codec, streaming buffer source.               |
| [`plugins/dtmf`](plugins/dtmf)         | The reference recognizer: all 16 DTMF keys from spectral peak pairs, with a debouncing state machine.                     |
| [`apps/playground`](apps/playground)   | Vite + React playground: every pipeline stage live and inspectable.                                                       |
| [`website`](website)                   | Next.js site: project introduction (hosted playground and Learn section to follow).                                       |

## Documentation

- **[Architecture](docs/architecture.md)** — the pipeline, the glyph and feature-stream abstractions, the plugin contract, layering rules, and the TypeScript-now / Rust-WASM-later DSP engine strategy.
- **[Plugin authoring](docs/plugins.md)** — build a recognizer from scratch against `core` + `plugin-sdk`, test it under realistic noise in a few lines, and run it live — without reading framework internals.
- **[Roadmap](docs/roadmap.md)** — the phased implementation plan, testing strategy, CI/CD plan, and the concrete triggers for the Rust/WASM switch.

## License

[MIT](LICENSE)
