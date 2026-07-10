/**
 * @sonoglyph/eridian — the constructed chord-language from *Project Hail
 * Mary*, deterministically defined: phonology, lexicon, grammar, and a
 * text-to-audio synthesizer. See docs/eridian.md for the full spec.
 */
export {
  TONIC_HZ,
  REGISTER_AFFECT,
  degreeFrequencyHz,
  triad,
  dyad,
  isParticle,
  chordFor,
  SYLLABLE_DURATION_SEC,
  INTRA_WORD_GAP_SEC,
  INTER_WORD_GAP_SEC,
  MIN_CHORD_DURATION_SEC,
  type Register,
  type Chord,
  type ContentSyllable,
  type ParticleSyllable,
  type SyllableCode,
} from './phonology.ts';

export {
  LEXICON,
  LEXICON_SCHEMA_VERSION,
  wordOf,
  byWord,
  byCode,
  byCategory,
  search,
  type Lexicon,
  type LexiconEntry,
  type WordCategory,
} from './lexicon.ts';

export {
  sentenceToTokens,
  wordToTokens,
  utteranceToTokens,
  parseTokens,
  type Sentence,
  type Tense,
  type Utterance,
  type SyllableToken,
} from './grammar.ts';

export {
  renderChord,
  renderTokens,
  renderWord,
  renderSentence,
  renderUtterance,
  type SynthOptions,
} from './synth.ts';
