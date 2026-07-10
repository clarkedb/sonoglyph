import {
  byWord,
  renderSentence,
  renderTokens,
  renderWord,
  type Register,
  type SyllableToken,
} from '@sonoglyph/eridian';
import { mix } from '@sonoglyph/dsp';
import { decode, fanRumble } from '@sonoglyph/testing';
import { describe, expect, it } from 'vitest';
import { EridianRecognizer, type EridianChordPayload } from './eridian.ts';

const SR = 48_000;

const TRIADS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'] as const;
const PARTICLES = ['Q', 'NEG', 'BE', 'PST', 'FUT', 'AND'] as const;

/** Decode a signal with a fresh recognizer and return the glyphs. */
function run(signal: Float32Array) {
  return decode(signal, new EridianRecognizer());
}

/** Syllable codes of the recognized glyphs, in order. */
function codes(signal: Float32Array): string[] {
  return run(signal).map((g) => g.symbol);
}

/** Render a bare syllable sequence at a register, as one word. */
function word(seq: SyllableToken['code'][], register: Register = 0): Float32Array {
  const tokens: SyllableToken[] = seq.map((code, i) => ({
    code,
    boundary: i < seq.length - 1 ? 'syllable' : 'final',
  }));
  return renderTokens(tokens, { sampleRate: SR, register });
}

describe('EridianRecognizer', () => {
  it('recognizes a single content-word triad', () => {
    const glyphs = run(word(['S5'])); // "good"
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.symbol).toBe('S5');
    const payload = glyphs[0]!.payload as EridianChordPayload;
    expect(payload.content).toBe(true);
    expect(payload.register).toBe(0);
    expect(payload.detectedHz).toHaveLength(3);
    expect(glyphs[0]!.confidence).toBeGreaterThan(0.8);
  });

  it('recognizes a single particle dyad without mistaking it for a triad', () => {
    const glyphs = run(word(['Q']));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.symbol).toBe('Q');
    const payload = glyphs[0]!.payload as EridianChordPayload;
    expect(payload.content).toBe(false);
    expect(payload.detectedHz).toHaveLength(2);
  });

  it('recognizes every triad and every well-separated particle at register 0', () => {
    for (const code of TRIADS) expect(codes(word([code]))).toEqual([code]);
    // Every particle except PST, whose two notes are adjacent scale degrees
    // (a whole tone, ~27 Hz at register 0) and merge into one FFT peak at the
    // default 2048-sample window — see the resolution test below.
    for (const code of ['Q', 'NEG', 'BE', 'FUT', 'AND'] as const) {
      expect(codes(word([code]))).toEqual([code]);
    }
  });

  it('recognizes the whole inventory an octave up, in registers +1 and +2', () => {
    for (const register of [1, 2] as const) {
      for (const code of [...TRIADS, ...PARTICLES]) {
        expect(codes(word([code], register))).toEqual([code]);
      }
    }
  });

  it('reports the octave register — the language’s emotion channel', () => {
    // "amaze" (S7) is the book's exclamation precisely because it's shouted
    // an octave up (register +1), not because the word itself changes.
    const glyphs = run(word(['S7'], 1));
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.symbol).toBe('S7');
    expect((glyphs[0]!.payload as EridianChordPayload).register).toBe(1);
    // The same syllable in the neutral register is the same word.
    expect((run(word(['S7'], 0))[0]!.payload as EridianChordPayload).register).toBe(0);
  });

  it('splits a reduplicated word into two glyphs (S3-S3 = "human")', () => {
    expect(codes(word(['S3', 'S3']))).toEqual(['S3', 'S3']);
  });

  it('splits a two-syllable compound into its syllables (S1-S2 = "friend")', () => {
    expect(codes(word(['S1', 'S2']))).toEqual(['S1', 'S2']);
  });

  it('decodes a full sentence "you good" (S2 S5)', () => {
    const you = byWord(['S2'])!;
    const good = byWord(['S5'])!;
    const signal = renderSentence({ subject: you, predicate: good }, { sampleRate: SR });
    expect(codes(signal)).toEqual(['S2', 'S5']);
  });

  it('decodes a sentence with a direct object and a future-tense suffix', () => {
    // "me you hear-will" = S1 S2 S3-S6 FUT
    const me = byWord(['S1'])!;
    const you = byWord(['S2'])!;
    const hear = byWord(['S3', 'S6'])!;
    const signal = renderSentence(
      { subject: me, object: you, predicate: hear, tense: 'future' },
      { sampleRate: SR },
    );
    expect(codes(signal)).toEqual(['S1', 'S2', 'S3', 'S6', 'FUT']);
  });

  it('tolerates pink-ish fan rumble under the chords', () => {
    const clean = renderWord(byWord(['S3', 'S3'])!, { sampleRate: SR });
    const noisy = mix(clean, fanRumble(clean.length / SR, SR, 0.15));
    expect(codes(noisy)).toEqual(['S3', 'S3']);
  });

  it('emits nothing for silence', () => {
    expect(run(new Float32Array(SR))).toEqual([]);
  });

  // --- Frequency-resolution boundary (the central DSP tradeoff, live) ------

  it('the whole-tone particle PST blurs at register 0 but resolves an octave up', () => {
    // At register 0 PST's notes (220 / 246.94 Hz) sit ~1.1 FFT bins apart at
    // the 2048-sample window and merge into a single peak — so the dyad's
    // second note goes missing and no syllable matches.
    expect(codes(word(['PST'], 0))).toEqual([]);
    // Transposed up an octave the same interval spans ~2.3 bins and resolves,
    // proving the miss is frequency resolution, not recognizer logic.
    expect(codes(word(['PST'], 1))).toEqual(['PST']);
  });

  it('the subdued registers fall below the 2048-window resolving floor', () => {
    // Registers −1 and −2 halve (and quarter) every note and its spacing,
    // pushing the closest scale degrees under one FFT bin. The recognizer
    // misses rather than mis-hears — no wrong glyph is ever emitted.
    expect(codes(word(['S5'], -2))).toEqual([]);
    expect(codes(word(['S5'], -1))).not.toContain('S5');
  });
});
