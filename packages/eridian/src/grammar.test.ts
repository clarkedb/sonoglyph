import { describe, expect, it } from 'vitest';
import { parseTokens, sentenceToTokens, wordToTokens, type Sentence } from './grammar.ts';
import { byWord } from './lexicon.ts';

const ME = byWord(['S1'])!;
const YOU = byWord(['S2'])!;
const HUMAN = byWord(['S3', 'S3'])!;
const GOOD = byWord(['S5'])!;
const HEAR = byWord(['S3', 'S6'])!;
const BE = byWord(['BE'])!;
const Q = byWord(['Q'])!;

describe('sentenceToTokens', () => {
  it('orders a plain statement Subject Predicate', () => {
    const sentence: Sentence = { subject: YOU, predicate: GOOD };
    const codes = sentenceToTokens(sentence).map((t) => t.code);
    expect(codes).toEqual(['S2', 'S5']);
  });

  it('orders Subject Object Verb for a transitive sentence', () => {
    const sentence: Sentence = { subject: ME, object: YOU, predicate: HEAR };
    const codes = sentenceToTokens(sentence).map((t) => t.code);
    expect(codes).toEqual(['S1', 'S2', 'S3', 'S6']);
  });

  it('glues a tense marker onto the predicate as one more syllable', () => {
    const sentence: Sentence = { subject: ME, object: YOU, predicate: HEAR, tense: 'future' };
    const codes = sentenceToTokens(sentence).map((t) => t.code);
    expect(codes).toEqual(['S1', 'S2', 'S3', 'S6', 'FUT']);
    // The tense marker joins the verb's own word — no 'word' gap before it.
    const boundaries = sentenceToTokens(sentence).map((t) => t.boundary);
    expect(boundaries[boundaries.length - 2]).toBe('syllable');
  });

  it('places NEG before and Q after the rest of the sentence', () => {
    const sentence: Sentence = { subject: YOU, predicate: GOOD, negated: true, question: true };
    const codes = sentenceToTokens(sentence).map((t) => t.code);
    expect(codes).toEqual(['NEG', 'S2', 'S5', 'Q']);
  });

  it('uses BE for a noun-to-noun identity statement', () => {
    const sentence: Sentence = { subject: ME, object: HUMAN, predicate: BE };
    const codes = sentenceToTokens(sentence).map((t) => t.code);
    expect(codes).toEqual(['S1', 'S3', 'S3', 'BE']);
  });

  it('marks only the last token as final', () => {
    const sentence: Sentence = { subject: YOU, predicate: GOOD, question: true };
    const boundaries = sentenceToTokens(sentence).map((t) => t.boundary);
    expect(boundaries.slice(0, -1)).not.toContain('final');
    expect(boundaries[boundaries.length - 1]).toBe('final');
  });
});

describe('parseTokens', () => {
  it('round-trips a plain statement', () => {
    const sentence: Sentence = { subject: YOU, predicate: GOOD };
    const parsed = parseTokens(sentenceToTokens(sentence));
    expect(parsed).toEqual({ kind: 'sentence', sentence });
  });

  it('round-trips a negated, tensed, questioned transitive sentence', () => {
    const sentence: Sentence = {
      subject: ME,
      object: YOU,
      predicate: HEAR,
      tense: 'past',
      negated: true,
      question: true,
    };
    const parsed = parseTokens(sentenceToTokens(sentence));
    expect(parsed).toEqual({ kind: 'sentence', sentence });
  });

  it('round-trips an identity statement', () => {
    const sentence: Sentence = { subject: ME, object: HUMAN, predicate: BE };
    const parsed = parseTokens(sentenceToTokens(sentence));
    expect(parsed).toEqual({ kind: 'sentence', sentence });
  });

  it('parses a bare word as a standalone utterance', () => {
    const parsed = parseTokens(wordToTokens(Q));
    expect(parsed).toEqual({ kind: 'word', entry: Q });
  });

  it('throws on a chord sequence with no matching word', () => {
    expect(() =>
      parseTokens([
        { code: 'S1', boundary: 'syllable' },
        { code: 'S7', boundary: 'final' },
      ]),
    ).toThrow();
  });
});
