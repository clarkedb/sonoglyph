/**
 * @sonoglyph/plugin-eridian — recognition of the Eridian chord-language from
 * *Project Hail Mary*. The recognizer turns spectral peaks into syllable
 * glyphs (each a 2- or 3-note chord, with its octave register); the
 * translator turns syllable glyphs into words and sentences via the shared
 * `@sonoglyph/eridian` lexicon and grammar. See docs/eridian.md for the
 * language spec both build against.
 */
export { EridianRecognizer, DEFAULT_ERIDIAN_OPTIONS } from './eridian.ts';
export type { EridianOptions, EridianChordPayload } from './eridian.ts';
export { matchChord, ALL_SYLLABLES, ALL_REGISTERS, DEFAULT_CHORD_MATCH_OPTIONS } from './chords.ts';
export type { ChordMatch, ChordMatchOptions } from './chords.ts';
export { EridianTranslator, DEFAULT_ERIDIAN_TRANSLATOR_OPTIONS } from './translator.ts';
export type {
  EridianTranslation,
  EridianUtterance,
  EridianWord,
  EridianTranslatorOptions,
} from './translator.ts';
