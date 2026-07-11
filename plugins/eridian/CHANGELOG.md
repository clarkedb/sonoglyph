# @sonoglyph/plugin-eridian

## 0.2.0

### Minor Changes

- 3d56c89: The Eridian recognizer plugin (`plugins/eridian`) — the Rocky plugin from
  _Project Hail Mary_. `EridianRecognizer` turns the `peaks` stream into
  syllable glyphs, matching `@sonoglyph/eridian`'s 2- and 3-note chords across
  all five octave registers, so each glyph carries its syllable code and the
  register (the language's emotion channel). `EridianTranslator` reads those
  chord glyphs back through the shared lexicon and the language's own
  `parseTokens` grammar — the first translator to exercise the Meaning layer
  with real structure: dictionary lookup, tense-suffix stripping, graceful
  unknown-word handling, and register read back as affect. Private for now,
  alongside `@sonoglyph/eridian`; teaching mode and dictionary persistence
  remain a follow-up.

### Patch Changes

- Updated dependencies [a9e662e]
  - @sonoglyph/core@0.2.0
  - @sonoglyph/plugin-sdk@0.2.0
  - @sonoglyph/eridian@0.1.1
