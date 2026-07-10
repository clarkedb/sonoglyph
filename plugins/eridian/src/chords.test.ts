import type { SpectralPeak } from '@sonoglyph/core';
import { chordFor, type Register, type SyllableCode } from '@sonoglyph/eridian';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHORD_MATCH_OPTIONS, matchChord } from './chords.ts';

/** Peaks standing in for a clean recording of one syllable: one peak per
 * note, all equally loud, plus any extra peaks the caller adds. */
function peaksFor(
  code: SyllableCode,
  register: Register,
  extra: SpectralPeak[] = [],
): SpectralPeak[] {
  const notes = chordFor(code, register).notesHz;
  const chord = notes.map((frequencyHz, i) => ({ frequencyHz, magnitude: 1, bin: i }));
  return [...chord, ...extra];
}

describe('matchChord', () => {
  it('identifies a content triad and its register', () => {
    const match = matchChord(peaksFor('S1', 0));
    expect(match?.code).toBe('S1');
    expect(match?.register).toBe(0);
    expect(match?.content).toBe(true);
    expect(match?.detectedHz).toHaveLength(3);
    expect(match?.deviation).toBeCloseTo(0, 5);
  });

  it('identifies a particle dyad', () => {
    const match = matchChord(peaksFor('NEG', 0));
    expect(match?.code).toBe('NEG');
    expect(match?.content).toBe(false);
    expect(match?.detectedHz).toHaveLength(2);
  });

  it('recovers the octave register a chord was voiced in', () => {
    for (const register of [-2, -1, 0, 1, 2] as const) {
      expect(matchChord(peaksFor('S5', register))?.register).toBe(register);
    }
  });

  it('prefers the full triad over a dyad that is merely its subset', () => {
    // S1 = {1,3,5}; Q = {1,5} is a subset of it. Given all three notes, the
    // three-note reading must win — a real S1, not a Q with a stray peak.
    const match = matchChord(peaksFor('S1', 0));
    expect(match?.code).toBe('S1');
  });

  it('reads a dyad as the dyad when the triad’s third note is absent', () => {
    // Only Q's two notes are present; S1 would need a third that isn't there.
    const q = chordFor('Q', 0).notesHz;
    const peaks = q.map((frequencyHz, i) => ({ frequencyHz, magnitude: 1, bin: i }));
    expect(matchChord(peaks)?.code).toBe('Q');
  });

  it('rejects a chord drowned out by a much louder out-of-chord peak', () => {
    const intruder: SpectralPeak = { frequencyHz: 1000, magnitude: 5, bin: 99 };
    expect(matchChord(peaksFor('S1', 0, [intruder]))).toBeNull();
  });

  it('ignores loud peaks outside the recognizer’s band', () => {
    // A 40 Hz rumble below the 50 Hz band floor must not veto the chord.
    const rumble: SpectralPeak = { frequencyHz: 40, magnitude: 9, bin: 1 };
    expect(matchChord(peaksFor('S1', 0, [rumble]))?.code).toBe('S1');
  });

  it('accepts a note detuned within tolerance and rejects one beyond it', () => {
    const notes = chordFor('S5', 0).notesHz;
    const within = notes.map((f, i) => ({
      frequencyHz: f * (i === 0 ? 1.02 : 1), // 2% off, inside the 2.5% window
      magnitude: 1,
      bin: i,
    }));
    expect(matchChord(within)?.code).toBe('S5');

    const beyond = notes.map((f, i) => ({
      frequencyHz: f * (i === 0 ? 1.05 : 1), // 5% off, outside tolerance
      magnitude: 1,
      bin: i,
    }));
    expect(matchChord(beyond)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const noise: SpectralPeak[] = [
      { frequencyHz: 137, magnitude: 1, bin: 5 },
      { frequencyHz: 611, magnitude: 1, bin: 26 },
    ];
    expect(matchChord(noise)).toBeNull();
  });

  it('confines its search to the configured registers', () => {
    // Peaks for S5 at register +2, but only register 0 is searched: no match.
    expect(
      matchChord(peaksFor('S5', 2), { ...DEFAULT_CHORD_MATCH_OPTIONS, registers: [0] }),
    ).toBeNull();
  });
});
