'use client';

import { useCallback } from 'react';
import { DEFAULT_ENGINE_OPTIONS } from '@sonoglyph/dsp';
import {
  byWord,
  chordFor,
  renderChord,
  renderTokens,
  renderUtterance,
  renderWord,
  SYLLABLE_DURATION_SEC,
  type Chord,
  type LexiconEntry,
  type Register,
  type SyllableCode,
  type SyllableToken,
  type Utterance,
} from '@sonoglyph/eridian';
import { fadeInPlace, useAudioPlayback } from '../../learn/components/use-audio';

/**
 * Audio helpers for the Eridian explorer. Every sound is synthesized the same
 * way the recognizer will eventually decode it — pure tones through
 * `@sonoglyph/eridian`'s renderers — so the dictionary, the tour, and the
 * composer all voice exactly what the pipeline round-trips. The sample rate is
 * the DSP engine's own default, so a buffer played here can be pushed straight
 * through a live `Pipeline` (the composer does exactly that).
 */
export const ERIDIAN_SAMPLE_RATE = DEFAULT_ENGINE_OPTIONS.sampleRate;

/** One syllable's chord, rendered at `register`. */
export function chordAudio(code: SyllableCode, register: Register): Float32Array {
  return renderChord(chordFor(code, register), SYLLABLE_DURATION_SEC, ERIDIAN_SAMPLE_RATE);
}

/** A dictionary word (its syllables, back to back), rendered at `register`. */
export function wordAudio(entry: LexiconEntry, register: Register): Float32Array {
  return renderWord(entry, { sampleRate: ERIDIAN_SAMPLE_RATE, register });
}

/** A whole utterance — sentence or bare word — rendered at `register`. */
export function utteranceAudio(utterance: Utterance, register: Register): Float32Array {
  return renderUtterance(utterance, { sampleRate: ERIDIAN_SAMPLE_RATE, register });
}

/** The frequencies of a syllable's chord at `register`, in nominal order. */
export function chordNotes(code: SyllableCode, register: Register): Chord {
  return chordFor(code, register);
}

/** Resolve a list of syllable-code words into lexicon entries (throws on a
 * typo, so a mistyped example fails loudly at module load rather than silently). */
export function entriesFromCodes(words: SyllableCode[][]): LexiconEntry[] {
  return words.map((codes) => {
    const entry = byWord(codes);
    if (!entry) throw new Error(`No lexicon entry for ${codes.join('-')}`);
    return entry;
  });
}

/** A tense suffix (PST/FUT) voices as one more syllable of the verb before it,
 * with no inter-word gap — the grammar's "tense glues onto the predicate" rule. */
function isTenseSuffix(entry: LexiconEntry): boolean {
  return (
    entry.syllables.length === 1 && (entry.syllables[0] === 'PST' || entry.syllables[0] === 'FUT')
  );
}

/** Flatten an ordered list of words into a gap-annotated chord stream: small
 * gaps within a word, larger gaps between words, tense suffixes glued on. */
export function wordsToTokens(words: LexiconEntry[]): SyllableToken[] {
  const tokens: SyllableToken[] = [];
  words.forEach((entry, wi) => {
    const lastWord = wi === words.length - 1;
    const nextGluesOn = !lastWord && isTenseSuffix(words[wi + 1]!);
    entry.syllables.forEach((code, si) => {
      const lastSyl = si === entry.syllables.length - 1;
      const boundary: SyllableToken['boundary'] = !lastSyl
        ? 'syllable'
        : lastWord
          ? 'final'
          : nextGluesOn
            ? 'syllable'
            : 'word';
      tokens.push({ code, boundary });
    });
  });
  return tokens;
}

/** Render an ordered list of words to audio at `register`. */
export function wordsAudio(words: LexiconEntry[], register: Register): Float32Array {
  return renderTokens(wordsToTokens(words), { sampleRate: ERIDIAN_SAMPLE_RATE, register });
}

/**
 * A player bound to a lazily-created AudioContext. Applies a short raised-cosine
 * fade to a copy of the buffer so the tone starts and ends without a click, and
 * leaves the caller's buffer untouched (the composer reuses it for the pipeline).
 */
export function useEridianAudio(): (samples: Float32Array) => void {
  const play = useAudioPlayback();
  return useCallback(
    (samples: Float32Array) => {
      play(fadeInPlace(samples.slice(), ERIDIAN_SAMPLE_RATE), ERIDIAN_SAMPLE_RATE);
    },
    [play],
  );
}
