/**
 * Eridian text → audio. Pure functions on `@sonoglyph/dsp`'s signal
 * synthesis helpers (`tones`, `silence`, `concat`) — no recordings, no
 * fixtures: every example in docs/eridian.md and every test in this
 * package is generated the same way the mic input eventually will be
 * decoded, just run in reverse.
 */
import { concat, silence, tones, type ToneSpec } from '@sonoglyph/dsp';
import type { Sentence, SyllableToken, Utterance } from './grammar.ts';
import { sentenceToTokens, utteranceToTokens, wordToTokens } from './grammar.ts';
import type { LexiconEntry } from './lexicon.ts';
import {
  chordFor,
  INTER_WORD_GAP_SEC,
  INTRA_WORD_GAP_SEC,
  SYLLABLE_DURATION_SEC,
  type Chord,
  type Register,
} from './phonology.ts';

export interface SynthOptions {
  sampleRate: number;
  /** Octave register the whole utterance is voiced in. Default 0 (neutral). */
  register?: Register;
  syllableDurationSec?: number;
  intraWordGapSec?: number;
  interWordGapSec?: number;
}

interface ResolvedOptions {
  sampleRate: number;
  register: Register;
  syllableDurationSec: number;
  intraWordGapSec: number;
  interWordGapSec: number;
}

function resolve(opts: SynthOptions): ResolvedOptions {
  return {
    sampleRate: opts.sampleRate,
    register: opts.register ?? 0,
    syllableDurationSec: opts.syllableDurationSec ?? SYLLABLE_DURATION_SEC,
    intraWordGapSec: opts.intraWordGapSec ?? INTRA_WORD_GAP_SEC,
    interWordGapSec: opts.interWordGapSec ?? INTER_WORD_GAP_SEC,
  };
}

/** One syllable, rendered: its notes summed, each at equal amplitude so the
 * mix never exceeds full scale regardless of chord size. */
export function renderChord(chord: Chord, durationSec: number, sampleRate: number): Float32Array {
  const amplitude = 1 / chord.notesHz.length;
  const specs: ToneSpec[] = chord.notesHz.map((frequencyHz) => ({ frequencyHz, amplitude }));
  return tones(specs, durationSec, sampleRate);
}

function gapSecFor(boundary: SyllableToken['boundary'], opts: ResolvedOptions): number {
  switch (boundary) {
    case 'syllable':
      return opts.intraWordGapSec;
    case 'word':
      return opts.interWordGapSec;
    case 'final':
      return 0;
  }
}

/** Render an already-flattened chord sequence — the shared engine behind
 * every render* function below. */
export function renderTokens(tokens: SyllableToken[], opts: SynthOptions): Float32Array {
  const resolved = resolve(opts);
  const parts: Float32Array[] = [];
  for (const token of tokens) {
    parts.push(
      renderChord(
        chordFor(token.code, resolved.register),
        resolved.syllableDurationSec,
        resolved.sampleRate,
      ),
    );
    const gapSec = gapSecFor(token.boundary, resolved);
    if (gapSec > 0) parts.push(silence(gapSec, resolved.sampleRate));
  }
  return concat(...parts);
}

/** Render a single dictionary word (its syllables, back to back). */
export function renderWord(entry: LexiconEntry, opts: SynthOptions): Float32Array {
  return renderTokens(wordToTokens(entry), opts);
}

/** Render a full sentence built from `grammar.ts`'s `Sentence` shape. */
export function renderSentence(sentence: Sentence, opts: SynthOptions): Float32Array {
  return renderTokens(sentenceToTokens(sentence), opts);
}

/** Render any utterance — a sentence or a word spoken alone. */
export function renderUtterance(utterance: Utterance, opts: SynthOptions): Float32Array {
  return renderTokens(utteranceToTokens(utterance), opts);
}
