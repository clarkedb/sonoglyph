---
'@sonoglyph/core': minor
'@sonoglyph/dsp': minor
'@sonoglyph/browser': minor
'@sonoglyph/plugin-sdk': minor
'@sonoglyph/testing': minor
'@sonoglyph/plugin-dtmf': minor
'@sonoglyph/plugin-morse': minor
---

First public release: the Phase 2 plugin platform. `@sonoglyph/plugin-sdk` turns per-frame classifiers into recognizer plugins (`defineRecognizer` — segmentation, debouncing, and span-corrected durations for free); `@sonoglyph/testing` provides signal builders and a microphone-faithful decode harness; `@sonoglyph/plugin-dtmf` ships both the FFT-peaks reference recognizer and a noise-adaptive Goertzel one over the new raw `samples` stream; `@sonoglyph/plugin-morse` decodes keyed Morse from the envelope stream and translates it to text through the new `Translator` (Meaning layer) contract in `@sonoglyph/core`.
