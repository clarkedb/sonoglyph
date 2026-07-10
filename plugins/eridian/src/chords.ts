/**
 * Matching a spectrum's peaks to one Eridian syllable — the plugin's
 * frequency-domain core, the chord-language counterpart of the DTMF
 * plugin's `frequencies.ts`.
 *
 * Where DTMF looks for one peak in each of two fixed tone groups, an
 * Eridian syllable is a 2- or 3-note chord drawn from a seven-degree major
 * scale, voiced in one of five octave registers (the language's emotion
 * channel — see docs/eridian.md#register). So matching does two things at
 * once: it identifies *which* syllable sounded and *which register* it was
 * sung in, by scanning every (code, register) pair and keeping the one
 * whose notes the peaks actually contain.
 *
 * All chord math is delegated to `@sonoglyph/eridian` — the language spec's
 * executable form — rather than duplicated here: `chordFor(code, register)`
 * is the single source of truth for a syllable's frequencies.
 */
import type { SpectralPeak } from '@sonoglyph/core';
import { chordFor, isParticle, type Register, type SyllableCode } from '@sonoglyph/eridian';

/** Every syllable code — the seven content triads, then the six particle
 * dyads. The whole recognizable inventory (docs/eridian.md#chord-inventory). */
export const ALL_SYLLABLES: readonly SyllableCode[] = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'Q',
  'NEG',
  'BE',
  'PST',
  'FUT',
  'AND',
];

/** The five octave registers, subdued to elated (docs/eridian.md#register). */
export const ALL_REGISTERS: readonly Register[] = [-2, -1, 0, 1, 2];

export interface ChordMatchOptions {
  /**
   * Accepted deviation of a detected note from its nominal frequency, as a
   * fraction of that frequency. Adjacent notes across the whole
   * multi-register grid are never closer than one semitone (~5.95%), so a
   * tolerance below ~3% keeps a detected note from being ascribed to the
   * wrong degree; the default of 2.5% sits under that ceiling while leaving
   * room for the coarse frequency resolution at the lowest registers.
   */
  freqTolerance: number;
  /**
   * The frequency band the recognizer considers, in Hz. Peaks outside it are
   * invisible to the dominance check — like DTMF band-limiting, this keeps
   * fan rumble, a bass line, or speech fundamentals from vetoing a chord
   * they say nothing about. The default spans register −2's tonic (55 Hz) to
   * register +2's highest triad note (~2349 Hz).
   */
  bandHz: readonly [number, number];
  /**
   * An in-band peak that is *not* one of the chord's notes and is louder than
   * `dominanceRatio ×` the weakest matched note rejects the match — the
   * chord must stand out from whatever else is sounding, the way DTMF
   * requires its pair to dominate the band. (What separates a two-note
   * particle from the three-note triad that contains it is the note-count
   * preference in `matchChord`, not this check: a triad needs all three
   * notes present, and when they are, it out-scores the dyad subset.)
   */
  dominanceRatio: number;
  /** Which registers to search. */
  registers: readonly Register[];
}

export const DEFAULT_CHORD_MATCH_OPTIONS: ChordMatchOptions = {
  freqTolerance: 0.025,
  bandHz: [50, 2600],
  dominanceRatio: 2,
  registers: ALL_REGISTERS,
};

/** A syllable identified in one frame's peaks. */
export interface ChordMatch {
  /** The syllable that sounded. */
  code: SyllableCode;
  /** The octave register it was voiced in. */
  register: Register;
  /** True for a three-note content triad, false for a two-note particle. */
  content: boolean;
  /** Detected peak frequency for each nominal note, in nominal order, Hz. */
  detectedHz: number[];
  /** Nominal note frequencies for `code` at `register`, in order, Hz. */
  nominalHz: number[];
  /**
   * Mean per-note deviation as a fraction of the tolerance: 0 is a perfect
   * hit on every note, 1 sits every note right at the tolerance edge. The
   * basis for per-frame confidence (`1 − deviation`).
   */
  deviation: number;
}

/** The strongest peak within tolerance of `nominalHz`, and how far off it
 * was (as a fraction of the tolerance window), or null if none qualifies. */
function matchNote(
  peaks: readonly SpectralPeak[],
  nominalHz: number,
  tolerance: number,
): { peak: SpectralPeak; deviation: number } | null {
  let best: { peak: SpectralPeak; deviation: number } | null = null;
  for (const peak of peaks) {
    const deviation = Math.abs(peak.frequencyHz - nominalHz) / (nominalHz * tolerance);
    if (deviation > 1) continue;
    if (!best || peak.magnitude > best.peak.magnitude) best = { peak, deviation };
  }
  return best;
}

/** All notes of a candidate chord matched to peaks, with the per-note detail
 * a `ChordMatch` needs — or null if any note is missing. */
function matchNotes(
  peaks: readonly SpectralPeak[],
  nominalHz: readonly number[],
  tolerance: number,
): { peaks: SpectralPeak[]; detectedHz: number[]; deviation: number } | null {
  const matchedPeaks: SpectralPeak[] = [];
  const detectedHz: number[] = [];
  let deviationSum = 0;
  for (const nominal of nominalHz) {
    const hit = matchNote(peaks, nominal, tolerance);
    if (!hit) return null;
    matchedPeaks.push(hit.peak);
    detectedHz.push(hit.peak.frequencyHz);
    deviationSum += hit.deviation;
  }
  return { peaks: matchedPeaks, detectedHz, deviation: deviationSum / nominalHz.length };
}

/** No in-band peak outside the chord may outshine its weakest note by more
 * than `dominanceRatio` — the check that keeps a dyad and a triad that share
 * notes from being confused (see `dominanceRatio`). */
function dominates(
  peaks: readonly SpectralPeak[],
  matched: readonly SpectralPeak[],
  options: ChordMatchOptions,
): boolean {
  const [bandLow, bandHigh] = options.bandHz;
  let weakest = Infinity;
  for (const p of matched) weakest = Math.min(weakest, p.magnitude);
  const ceiling = options.dominanceRatio * weakest;
  for (const p of peaks) {
    if (matched.includes(p)) continue;
    if (p.frequencyHz < bandLow || p.frequencyHz > bandHigh) continue;
    if (p.magnitude > ceiling) return false;
  }
  return true;
}

/**
 * Identify the syllable one frame's peaks contain, or null if none fits.
 *
 * Every (code, register) pair is tried; a candidate survives only if all of
 * its notes are present within tolerance *and* it dominates the band. Among
 * the survivors the best is the one that explains the most peaks (a triad
 * over a dyad that is merely its subset), then the one whose notes land
 * closest to nominal.
 */
export function matchChord(
  peaks: readonly SpectralPeak[],
  options: ChordMatchOptions = DEFAULT_CHORD_MATCH_OPTIONS,
): ChordMatch | null {
  let best: ChordMatch | null = null;
  for (const register of options.registers) {
    for (const code of ALL_SYLLABLES) {
      const nominalHz = chordFor(code, register).notesHz;
      const matched = matchNotes(peaks, nominalHz, options.freqTolerance);
      if (!matched) continue;
      if (!dominates(peaks, matched.peaks, options)) continue;

      const candidate: ChordMatch = {
        code,
        register,
        content: !isParticle(code),
        detectedHz: matched.detectedHz,
        nominalHz,
        deviation: matched.deviation,
      };
      if (best === null || isBetter(candidate, best)) best = candidate;
    }
  }
  return best;
}

/** More notes explained wins; ties break toward the tighter fit. */
function isBetter(a: ChordMatch, b: ChordMatch): boolean {
  if (a.nominalHz.length !== b.nominalHz.length) {
    return a.nominalHz.length > b.nominalHz.length;
  }
  return a.deviation < b.deviation;
}
