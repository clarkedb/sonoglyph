/**
 * Eridian phonology: the chord inventory, register (octave) semantics, and
 * timing rules. See docs/eridian.md for the full rationale — this module is
 * the executable version of that spec.
 *
 * Every syllable is a chord: two or more concurrent pure-tone frequencies,
 * all drawn from one seven-degree major scale and voiced within a single
 * octave (root-to-highest-note span never exceeds 11 semitones — see
 * `triad`/`dyad`). Chord *size* marks word class — three notes for content
 * words, two for grammar particles — the same "distinguishable by
 * construction" idea behind DTMF's inharmonic tone groups, just applied to
 * word class instead of key identity.
 *
 * The octave a chord is voiced in (its `Register`) carries no lexical
 * meaning at all: it is pitch-shifted prosody, layered on top of whichever
 * word is being spoken, the way pitch contour carries emotion in human
 * speech.
 */

/** Semitone offsets of scale degrees 1..7 within one octave (major scale). */
const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

/** Tonic of the neutral register: A3. Register 0 spans 220 Hz to just under 440 Hz. */
export const TONIC_HZ = 220;

/**
 * Octave shift from the neutral register. Whole utterances (or individual
 * words, for contrastive emphasis) are transposed together; the word's
 * identity — its scale degrees — never changes, only where it sits.
 */
export type Register = -2 | -1 | 0 | 1 | 2;

/** The affect each register conventionally carries. Not enforced — a
 * recognizer or speaker is free to use intermediate feeling — but this is
 * the default reading, the same way a raised pitch reads as excited in
 * human speech. */
export const REGISTER_AFFECT: Record<Register, string> = {
  [-2]: 'grief / dread (extreme negative)',
  [-1]: 'solemn / sad / serious (negative, subdued)',
  0: 'neutral / matter-of-fact',
  1: 'excited / eager / alarmed (positive, urgent)',
  2: 'elated / awed (extreme positive)',
};

/** One syllable: a set of concurrent pure-tone frequencies, in Hz. */
export interface Chord {
  notesHz: number[];
}

/**
 * Frequency of scale-degree-from-tonic `n` (0-based: 0 is the tonic) at the
 * given register. `n` may exceed 6 — callers stacking thirds pass n = 2, 4,
 * etc. past the seven-note scale on purpose, and this still returns the
 * correct pitch by carrying the extra whole octaves.
 */
export function degreeFrequencyHz(n: number, register: Register): number {
  const octaves = Math.floor(n / 7);
  const semitone = MAJOR_SCALE_SEMITONES[n % 7]! + 12 * octaves;
  return TONIC_HZ * 2 ** register * 2 ** (semitone / 12);
}

/**
 * A content-word syllable: the triad built by stacking two thirds on top of
 * scale degree `degree` (1-7), e.g. degree 1 -> scale degrees {1, 3, 5}.
 * The top note is at most 7 semitones above the root (a fifth, the widest
 * case), so every triad fits comfortably inside one octave regardless of
 * register.
 */
export function triad(degree: 1 | 2 | 3 | 4 | 5 | 6 | 7, register: Register): Chord {
  const root = degree - 1;
  return { notesHz: [root, root + 2, root + 4].map((n) => degreeFrequencyHz(n, register)) };
}

/**
 * A grammar-particle syllable: the dyad of scale degrees `a` and `b`
 * (1-7 each). Two notes instead of three is what marks a chord as a
 * particle rather than a content word.
 */
export function dyad(
  a: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  b: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  register: Register,
): Chord {
  return { notesHz: [a - 1, b - 1].map((n) => degreeFrequencyHz(n, register)) };
}

// ---------------------------------------------------------------------------
// Syllable inventory
// ---------------------------------------------------------------------------

/** Content-word syllables: the triad on each of the seven scale degrees. */
export type ContentSyllable = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';

/** Grammar-particle syllables: each a distinct dyad (see docs/eridian.md#grammar). */
export type ParticleSyllable = 'Q' | 'NEG' | 'BE' | 'PST' | 'FUT' | 'AND';

export type SyllableCode = ContentSyllable | ParticleSyllable;

const CONTENT_DEGREE: Record<ContentSyllable, 1 | 2 | 3 | 4 | 5 | 6 | 7> = {
  S1: 1,
  S2: 2,
  S3: 3,
  S4: 4,
  S5: 5,
  S6: 6,
  S7: 7,
};

const PARTICLE_DEGREES: Record<
  ParticleSyllable,
  [1 | 2 | 3 | 4 | 5 | 6 | 7, 1 | 2 | 3 | 4 | 5 | 6 | 7]
> = {
  Q: [1, 5],
  NEG: [1, 4],
  BE: [2, 6],
  PST: [1, 2],
  FUT: [1, 7],
  AND: [2, 4],
};

export function isParticle(code: SyllableCode): code is ParticleSyllable {
  return code in PARTICLE_DEGREES;
}

/** The chord for any syllable code, voiced at the given register. */
export function chordFor(code: SyllableCode, register: Register): Chord {
  if (isParticle(code)) {
    const [a, b] = PARTICLE_DEGREES[code];
    return dyad(a, b, register);
  }
  return triad(CONTENT_DEGREE[code], register);
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** Nominal duration of one chord, in seconds. */
export const SYLLABLE_DURATION_SEC = 0.2;

/** Silence between syllables within the same word (e.g. a reduplicated or
 * compound root, or a verb and its tense suffix). */
export const INTRA_WORD_GAP_SEC = 0.06;

/** Silence between words in a sentence. */
export const INTER_WORD_GAP_SEC = 0.3;

/**
 * Forward-looking guidance for a future recognizer (none exists yet): the
 * minimum chord duration to trust a detection. Eridian's scale-degree
 * spacing within a register is tighter than DTMF's tone groups (as little
 * as ~9% between adjacent degrees, vs. DTMF's 73 Hz absolute gaps), so a
 * shorter analysis window smears more of the octave together — the same
 * window-size/frequency-resolution tradeoff `docs/architecture.md` calls
 * out for DTMF, just with less headroom.
 */
export const MIN_CHORD_DURATION_SEC = 0.12;
