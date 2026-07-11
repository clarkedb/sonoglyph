/**
 * Small music-theory helpers for the Eridian explorer's diagrams — turning a
 * raw frequency (as `@sonoglyph/eridian`'s `chordFor` reports it) into the two
 * human-readable labels the pitch views show: the note name and the scale
 * degree it occupies.
 *
 * The scale table below mirrors `phonology.ts`'s `MAJOR_SCALE_SEMITONES`; that
 * module stays the runtime source of truth (every chord is computed there),
 * and this is only the read-back for display, the same way docs/eridian.md
 * restates the frequency table without being a second source of it.
 */

/** Semitone offsets of scale degrees 1..7 (A-major, matching phonology.ts). */
const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Nearest equal-tempered note name with octave, e.g. 277.18 → "C♯4". */
export function noteName(frequencyHz: number): string {
  const midi = Math.round(69 + 12 * Math.log2(frequencyHz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]!;
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/**
 * The 1..7 scale degree a frequency sits on, in any register (degrees repeat
 * every octave, so the register cancels out), or null if it isn't on the
 * scale. Tonic is A (220 Hz at register 0).
 */
export function scaleDegreeOf(frequencyHz: number): number | null {
  const semitonesFromTonic = Math.round(12 * Math.log2(frequencyHz / 220));
  const within = ((semitonesFromTonic % 12) + 12) % 12;
  const index = MAJOR_SCALE_SEMITONES.indexOf(within);
  return index === -1 ? null : index + 1;
}
