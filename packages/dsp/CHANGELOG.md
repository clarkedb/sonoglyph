# @sonoglyph/dsp

## 0.2.0

### Minor Changes

- a9e662e: First public release: the Phase 2 plugin platform. `@sonoglyph/plugin-sdk` turns per-frame classifiers into recognizer plugins (`defineRecognizer` — segmentation, debouncing, and span-corrected durations for free); `@sonoglyph/testing` provides signal builders and a microphone-faithful decode harness; `@sonoglyph/plugin-dtmf` ships both the FFT-peaks reference recognizer and a noise-adaptive Goertzel one over the new raw `samples` stream; `@sonoglyph/plugin-morse` decodes keyed Morse from the envelope stream and translates it to text through the new `Translator` (Meaning layer) contract in `@sonoglyph/core`.

### Patch Changes

- Updated dependencies [a9e662e]
  - @sonoglyph/core@0.2.0
