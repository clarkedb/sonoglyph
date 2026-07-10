import {
  byWord,
  renderSentence,
  renderWord,
  type Sentence,
  type SyllableCode,
} from '@sonoglyph/eridian';
import { concat, silence } from '@sonoglyph/dsp';
import { decode } from '@sonoglyph/testing';
import { describe, expect, it } from 'vitest';
import { EridianRecognizer } from './eridian.ts';
import { EridianTranslator, type EridianTranslation } from './translator.ts';

const SR = 48_000;

/** Render → recognize → translate, the way the driver wires the pipeline:
 * push each glyph into the translator, then flush at end of stream. */
function translate(signal: Float32Array): EridianTranslation {
  const glyphs = decode(signal, new EridianRecognizer());
  const translator = new EridianTranslator();
  let latest = translator.value;
  translator.onMeaning((m) => (latest = m));
  for (const glyph of glyphs) translator.push(glyph);
  translator.flush();
  return latest;
}

const entry = (...codes: SyllableCode[]) => byWord(codes)!;

describe('EridianTranslator', () => {
  it('translates a bare adjective-predicate sentence: "you good"', () => {
    const sentence: Sentence = { subject: entry('S2'), predicate: entry('S5') };
    const t = translate(renderSentence(sentence, { sampleRate: SR }));
    expect(t.utterances).toHaveLength(1);
    expect(t.utterances[0]!.gloss).toBe('you good');
    expect(t.utterances[0]!.parsed?.kind).toBe('sentence');
    expect(t.utterances[0]!.hasUnknown).toBe(false);
  });

  it('translates a question', () => {
    const sentence: Sentence = { subject: entry('S2'), predicate: entry('S5'), question: true };
    const t = translate(renderSentence(sentence, { sampleRate: SR }));
    expect(t.utterances[0]!.gloss).toBe('you good?');
  });

  it('translates negation and a copula identity statement', () => {
    // "not me good"
    const neg: Sentence = { negated: true, subject: entry('S1'), predicate: entry('S5') };
    expect(translate(renderSentence(neg, { sampleRate: SR })).utterances[0]!.gloss).toBe(
      'not me good',
    );
    // "me human [is]" — S1 S3-S3 BE
    const be: Sentence = {
      subject: entry('S1'),
      object: entry('S3', 'S3'),
      predicate: entry('BE'),
    };
    const t = translate(renderSentence(be, { sampleRate: SR }));
    expect(t.utterances[0]!.gloss).toContain('human');
    expect(t.utterances[0]!.words.map((w) => w.gloss)).toEqual(['me', 'human', 'is']);
  });

  it('strips a tense suffix so the verb still resolves: "me you hear [future]"', () => {
    const sentence: Sentence = {
      subject: entry('S1'),
      object: entry('S2'),
      predicate: entry('S3', 'S6'), // hear
      tense: 'future',
    };
    const t = translate(renderSentence(sentence, { sampleRate: SR }));
    expect(t.utterances[0]!.gloss).toBe('me you to hear [future]');
    const verb = t.utterances[0]!.words.find((w) => w.tense);
    expect(verb?.tense).toBe('future');
    expect(verb?.entry?.syllables).toEqual(['S3', 'S6']);
  });

  it('handles a lone word spoken by itself: "Question?"', () => {
    const t = translate(renderWord(entry('Q'), { sampleRate: SR }));
    expect(t.utterances[0]!.parsed?.kind).toBe('word');
    expect(t.utterances[0]!.gloss.toLowerCase()).toContain('question');
  });

  it('reads the octave register back as emotional affect', () => {
    // "amaze" shouted an octave up — the book's exclamation.
    const t = translate(renderWord(entry('S7'), { sampleRate: SR, register: 1 }));
    expect(t.utterances[0]!.register).toBe(1);
    expect(t.utterances[0]!.affect).toMatch(/excited|eager|alarmed/);
  });

  it('keeps an unknown word visible instead of dropping it', () => {
    // S5-S7 is not a dictionary word; the parse fails and we fall back to a
    // per-word gloss with the unknown marked "?".
    const unknown = {
      syllables: ['S5', 'S7'] as SyllableCode[],
      gloss: '',
      category: 'noun' as const,
    };
    const t = translate(renderWord(unknown, { sampleRate: SR }));
    const utt = t.utterances[0]!;
    expect(utt.hasUnknown).toBe(true);
    expect(utt.parsed).toBeNull();
    expect(utt.words[0]!.entry).toBeNull();
    expect(utt.gloss).toContain('?');
  });

  it('separates two utterances across a long pause', () => {
    const first = renderSentence(
      { subject: entry('S2'), predicate: entry('S5') },
      { sampleRate: SR },
    );
    const second = renderSentence(
      { subject: entry('S1'), predicate: entry('S6') },
      { sampleRate: SR },
    );
    const signal = concat(first, silence(0.8, SR), second);
    const t = translate(signal);
    expect(t.utterances).toHaveLength(2);
    expect(t.utterances.map((u) => u.gloss)).toEqual(['you good', 'me bad']);
    expect(t.text).toBe('you good | me bad');
  });
});
