import { goertzelMagnitude } from '@sonoglyph/dsp';
import { describe, expect, it } from 'vitest';
import type { Sentence } from './grammar.ts';
import { byWord } from './lexicon.ts';
import {
  INTER_WORD_GAP_SEC,
  INTRA_WORD_GAP_SEC,
  SYLLABLE_DURATION_SEC,
  triad,
} from './phonology.ts';
import { renderChord, renderSentence, renderWord } from './synth.ts';

const SAMPLE_RATE = 48_000;

describe('renderChord', () => {
  it('produces exactly durationSec of audio', () => {
    const audio = renderChord(triad(1, 0), SYLLABLE_DURATION_SEC, SAMPLE_RATE);
    expect(audio.length).toBe(Math.round(SYLLABLE_DURATION_SEC * SAMPLE_RATE));
  });

  it('actually contains every note of the chord, and nothing far from it', () => {
    const chord = triad(5, 0);
    const audio = renderChord(chord, SYLLABLE_DURATION_SEC, SAMPLE_RATE);
    for (const hz of chord.notesHz) {
      expect(goertzelMagnitude(audio, hz, SAMPLE_RATE)).toBeGreaterThan(0.2);
    }
    expect(goertzelMagnitude(audio, 5000, SAMPLE_RATE)).toBeLessThan(0.02);
  });

  it('transposes an octave up when the register goes up', () => {
    const chord = triad(1, 1);
    const audio = renderChord(chord, SYLLABLE_DURATION_SEC, SAMPLE_RATE);
    // The neutral-register root (220 Hz) should be all but absent...
    expect(goertzelMagnitude(audio, 220, SAMPLE_RATE)).toBeLessThan(0.02);
    // ...while the register+1 root (440 Hz) is strong.
    expect(goertzelMagnitude(audio, 440, SAMPLE_RATE)).toBeGreaterThan(0.2);
  });
});

describe('renderWord', () => {
  it('renders a reduplicated word as two syllables with an intra-word gap', () => {
    const human = byWord(['S3', 'S3'])!;
    const audio = renderWord(human, { sampleRate: SAMPLE_RATE });
    const expectedLength =
      2 * Math.round(SYLLABLE_DURATION_SEC * SAMPLE_RATE) +
      Math.round(INTRA_WORD_GAP_SEC * SAMPLE_RATE);
    expect(audio.length).toBe(expectedLength);
  });
});

describe('renderSentence', () => {
  it('renders Subject Predicate with one inter-word gap', () => {
    const you = byWord(['S2'])!;
    const good = byWord(['S5'])!;
    const sentence: Sentence = { subject: you, predicate: good };
    const audio = renderSentence(sentence, { sampleRate: SAMPLE_RATE });
    const expectedLength =
      2 * Math.round(SYLLABLE_DURATION_SEC * SAMPLE_RATE) +
      Math.round(INTER_WORD_GAP_SEC * SAMPLE_RATE);
    expect(audio.length).toBe(expectedLength);
  });

  it("places each word's own chord in its own segment, gap in between", () => {
    const you = byWord(['S2'])!;
    const good = byWord(['S5'])!;
    const sentence: Sentence = { subject: you, predicate: good };
    const audio = renderSentence(sentence, { sampleRate: SAMPLE_RATE });
    const wordSamples = Math.round(SYLLABLE_DURATION_SEC * SAMPLE_RATE);
    const firstWord = audio.subarray(0, wordSamples);
    const secondWordStart = wordSamples + Math.round(INTER_WORD_GAP_SEC * SAMPLE_RATE);
    const secondWord = audio.subarray(secondWordStart, secondWordStart + wordSamples);
    expect(goertzelMagnitude(firstWord, triad(2, 0).notesHz[0]!, SAMPLE_RATE)).toBeGreaterThan(0.2);
    expect(goertzelMagnitude(secondWord, triad(5, 0).notesHz[0]!, SAMPLE_RATE)).toBeGreaterThan(
      0.2,
    );
  });
});
