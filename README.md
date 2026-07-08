# sonoglyph

beep boop beep = hello world?

Sonoglyph is a browser-first, extensible signal recognition framework. It provides a reusable digital signal processing pipeline — microphone to spectrum to detected features — and a plugin architecture that turns those features into **glyphs**: symbolic representations of recognized signals. A DTMF `5`, a Morse dash, a musical chord, and a syllable of an alien language are all glyphs.

```
Samples  →  Features  →  Glyphs  →  Meaning
```

The core never knows what a signal means; plugins do. Every stage of the pipeline is observable, because the project is as much about *teaching* signal processing as performing it. Inspired by the translator in *Project Hail Mary*, generalized into a platform for recognizing any structured signal system.

## Status

Planning. The first vertical slice (live DTMF decoding in an interactive playground) is specced and not yet built.

## Documentation

- **[Architecture](docs/architecture.md)** — the pipeline, the glyph and feature-stream abstractions, the plugin contract, layering rules, and the TypeScript-now / Rust-WASM-later DSP engine strategy.
- **[Roadmap](docs/roadmap.md)** — the phased implementation plan, testing strategy, CI/CD plan, and the concrete triggers for the Rust/WASM switch.

## License

[MIT](LICENSE)
