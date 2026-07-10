import { describe, expect, it } from 'vitest';
import { byCategory, byCode, byWord, LEXICON, search, wordOf } from './lexicon.ts';

describe('LEXICON', () => {
  it('has no duplicate words', () => {
    const words = LEXICON.entries.map(wordOf);
    expect(new Set(words).size).toBe(words.length);
  });

  it("contains the book's classics", () => {
    const glosses = LEXICON.entries.map((e) => e.gloss.toLowerCase());
    for (const term of ['human', 'eridian', 'good', 'bad', 'amaz', 'question', 'you', 'i']) {
      expect(glosses.some((g) => g.includes(term))).toBe(true);
    }
  });
});

describe('byWord / byCode', () => {
  it('finds a multi-syllable word by its exact syllable sequence', () => {
    const human = byWord(['S3', 'S3']);
    expect(human?.gloss).toContain('human');
  });

  it('finds a single-syllable word by its code', () => {
    expect(byCode('S1')?.gloss).toContain('me');
  });

  it('returns undefined for an unknown sequence', () => {
    expect(byWord(['S1', 'S1'])).toBeUndefined();
  });
});

describe('byCategory', () => {
  it('returns only entries of the requested category', () => {
    for (const entry of byCategory('particle')) {
      expect(entry.category).toBe('particle');
    }
    expect(byCategory('particle').length).toBeGreaterThan(0);
  });
});

describe('search', () => {
  it('matches glosses case-insensitively', () => {
    const hits = search('QUESTION');
    expect(hits.some((e) => e.gloss.toLowerCase().includes('question'))).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(search('')).toEqual([]);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(search('xyznotaword')).toEqual([]);
  });
});
