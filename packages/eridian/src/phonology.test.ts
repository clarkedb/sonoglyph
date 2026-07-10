import { describe, expect, it } from 'vitest';
import {
  chordFor,
  degreeFrequencyHz,
  dyad,
  isParticle,
  TONIC_HZ,
  triad,
  type ContentSyllable,
  type ParticleSyllable,
} from './phonology.ts';

describe('degreeFrequencyHz', () => {
  it('is the tonic at degree 0, register 0', () => {
    expect(degreeFrequencyHz(0, 0)).toBeCloseTo(TONIC_HZ, 6);
  });

  it('doubles per register (an octave)', () => {
    expect(degreeFrequencyHz(0, 1)).toBeCloseTo(TONIC_HZ * 2, 6);
    expect(degreeFrequencyHz(0, -1)).toBeCloseTo(TONIC_HZ / 2, 6);
  });

  it('carries whole octaves past the seven-note scale', () => {
    // Degree 7 (index 6, index 6 within the scale) then one octave on: n=13.
    expect(degreeFrequencyHz(13, 0)).toBeCloseTo(degreeFrequencyHz(6, 0) * 2, 6);
  });
});

describe('triad', () => {
  const degrees: (1 | 2 | 3 | 4 | 5 | 6 | 7)[] = [1, 2, 3, 4, 5, 6, 7];

  it('always produces three distinct concurrent notes', () => {
    for (const d of degrees) {
      const notes = triad(d, 0).notesHz;
      expect(notes).toHaveLength(3);
      expect(new Set(notes).size).toBe(3);
    }
  });

  it('never spans more than one octave, for any degree', () => {
    for (const d of degrees) {
      const notes = triad(d, 0).notesHz;
      const ratio = Math.max(...notes) / Math.min(...notes);
      expect(ratio).toBeLessThan(2);
    }
  });

  it('transposes cleanly by register: root doubles per octave', () => {
    const base = triad(1, 0).notesHz[0]!;
    const up = triad(1, 1).notesHz[0]!;
    expect(up).toBeCloseTo(base * 2, 6);
  });
});

describe('dyad', () => {
  it('produces exactly two concurrent, distinct notes', () => {
    const notes = dyad(1, 5, 0).notesHz;
    expect(notes).toHaveLength(2);
    expect(notes[0]).not.toBeCloseTo(notes[1]!, 3);
  });
});

describe('chordFor', () => {
  it('resolves every content syllable to a 3-note chord', () => {
    const codes: ContentSyllable[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
    for (const code of codes) {
      expect(chordFor(code, 0).notesHz).toHaveLength(3);
      expect(isParticle(code)).toBe(false);
    }
  });

  it('resolves every particle syllable to a distinct 2-note chord', () => {
    const codes: ParticleSyllable[] = ['Q', 'NEG', 'BE', 'PST', 'FUT', 'AND'];
    const seen = new Set<string>();
    for (const code of codes) {
      const notes = chordFor(code, 0).notesHz;
      expect(notes).toHaveLength(2);
      expect(isParticle(code)).toBe(true);
      const key = [...notes].sort().join(',');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
