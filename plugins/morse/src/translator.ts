import type { Glyph, Translator, Unsubscribe } from '@sonoglyph/core';
import { charFor } from './code.ts';
import type { MorseElementPayload } from './morse.ts';

/** One decoded letter of the transcript. */
export interface MorseLetter {
  /** The decoded character, or "?" when the code matches no known letter. */
  char: string;
  /** The dot/dash sequence it was assembled from, e.g. "...". */
  code: string;
  /** True if a word gap (~7 units of silence) preceded this letter — the
   * boundary the rendered text turns into a space. */
  wordBreakBefore: boolean;
}

/** The running decode: the assembled text plus the letters behind it. */
export interface MorseTranscript {
  /** The decoded text, words separated by single spaces. */
  text: string;
  /** Every decoded letter in order, each carrying the code it came from —
   * the "why did it decide that" view the UI renders. */
  letters: MorseLetter[];
}

// A gap this many units or more ends the current letter (nominal 3).
const LETTER_GAP_UNITS = 2;
// A gap this many units or more starts a new word (nominal 7).
const WORD_GAP_UNITS = 5;

const EMPTY: MorseTranscript = { text: '', letters: [] };

/**
 * The Meaning layer's first real resident: Morse element glyphs in,
 * decoded text out. Where the recognizer stops — a stream of dots and
 * dashes — this begins: the language-shaped work of grouping elements into
 * letters and letters into words.
 *
 * It reads structure entirely from the *silences* between element glyphs,
 * which is the whole character of Morse. Each element carries its length in
 * units, so `duration / units` recovers the unit clock the recognizer was
 * using; the gap to the next element, measured in those units, says whether
 * the letter continues (~1 unit), ends (~3), or a new word begins (~7).
 *
 * A letter only closes once the *next* element proves the gap — so the
 * final letter of a transmission needs `flush()`, called when the input
 * ends. (Making end-of-stream a first-class pipeline signal is tracked
 * separately; here it is a method the driver calls.)
 */
export class MorseTextTranslator implements Translator<MorseTranscript> {
  readonly id = 'morse-text';

  private readonly listeners = new Set<(meaning: MorseTranscript) => void>();
  private letters: MorseLetter[] = [];

  /** Dots/dashes of the letter currently being accumulated. */
  private code = '';
  /** Word-break flag for the letter in `code` (fixed when it started). */
  private pendingWordBreak = false;
  /** Force the next letter to start a new word — set when continuity
   * breaks (flush, or the engine's time base was rebuilt under us). */
  private forceBreak = false;
  /** Stream time the last element ended, and the unit length in force
   * then — the basis for sizing the next gap. Null before the first
   * element and after a continuity break. */
  private lastEnd: number | null = null;
  private lastUnitSec = 0;

  push(glyph: Glyph): void {
    if (glyph.pluginId !== 'morse') return;
    const units = (glyph.payload as MorseElementPayload | undefined)?.units;
    // Only element glyphs carry `units`; anything else isn't ours to read.
    if (units === undefined || units <= 0) return;

    const unitSec = glyph.duration / units;
    const gapUnits =
      this.lastEnd === null
        ? Number.POSITIVE_INFINITY
        : (glyph.start - this.lastEnd) / this.lastUnitSec;

    if (this.code !== '' && gapUnits >= LETTER_GAP_UNITS) {
      // The silence proves the letter in `code` ended; emit it, then this
      // element opens the next letter.
      this.emitLetter();
    }
    if (this.code === '') {
      // Starting a fresh letter: it begins a new word if a word-sized gap
      // preceded it, or if continuity was broken since the last letter.
      this.pendingWordBreak =
        this.forceBreak || (this.lastEnd !== null && gapUnits >= WORD_GAP_UNITS);
      this.forceBreak = false;
    }

    this.code += glyph.symbol;
    this.lastEnd = glyph.start + glyph.duration;
    this.lastUnitSec = unitSec;
  }

  /** True while a letter is still accumulating elements. */
  get hasPending(): boolean {
    return this.code !== '';
  }

  /**
   * Close the letter currently accumulating, if any — used to resolve a
   * letter the moment the sender pauses, rather than waiting for the next
   * element to prove the gap. The caller decides *when* enough silence has
   * elapsed (it watches the live signal); this just commits the letter.
   * lastEnd is left in place so the next element still measures its gap —
   * and thus a word break — from the last real element.
   */
  closePending(): void {
    if (this.code !== '') this.emitLetter();
  }

  /**
   * Close any letter still accumulating (the last one has no following
   * element to end it) and break continuity, so a later element starts a
   * new word rather than fusing across the gap. Called when the input
   * ends or the pipeline is rebuilt.
   */
  flush(): void {
    this.closePending();
    this.lastEnd = null;
    this.forceBreak = true;
  }

  onMeaning(cb: (meaning: MorseTranscript) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.letters = [];
    this.code = '';
    this.pendingWordBreak = false;
    this.forceBreak = false;
    this.lastEnd = null;
    this.lastUnitSec = 0;
    this.notify();
  }

  /** The transcript so far. */
  get value(): MorseTranscript {
    return this.letters.length === 0
      ? EMPTY
      : { text: this.textOf(this.letters), letters: this.letters };
  }

  private emitLetter(): void {
    this.letters = [
      ...this.letters,
      {
        // "?" keeps unknown codes visible instead of silently dropped —
        // mis-keyed letters are where decoding gets interesting.
        char: charFor(this.code) ?? '?',
        code: this.code,
        wordBreakBefore: this.pendingWordBreak,
      },
    ];
    this.code = '';
    this.notify();
  }

  private textOf(letters: MorseLetter[]): string {
    return letters.reduce(
      (acc, letter, i) => acc + (i > 0 && letter.wordBreakBefore ? ' ' : '') + letter.char,
      '',
    );
  }

  private notify(): void {
    const meaning = this.value;
    for (const cb of this.listeners) cb(meaning);
  }
}
