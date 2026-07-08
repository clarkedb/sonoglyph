import type { Glyph, Translator, Unsubscribe } from '@sonoglyph/core';
import type { MorseLetterPayload } from './morse.js';

/**
 * The Meaning layer's first real resident: letter glyphs in, decoded
 * text out. The recognizer already did the signal work; what's left is
 * language-shaped — assembling letters into words by reading the gaps
 * (a ~7-unit silence is a space) and keeping the running transcript.
 * Emits the full text after every letter, so UIs can just render the
 * latest meaning.
 */
export class MorseTextTranslator implements Translator<string> {
  readonly id = 'morse-text';

  private readonly listeners = new Set<(text: string) => void>();
  private text = '';

  push(glyph: Glyph): void {
    if (glyph.pluginId !== 'morse') return;
    // Elements ("." / "-") are recognition detail; letters carry a code
    // payload and are what language is made of.
    const payload = glyph.payload as MorseLetterPayload | undefined;
    if (!payload?.code) return;
    // Between letters the gap is ~3 units, between words ~7: split at 5.
    if (this.text !== '' && payload.gapUnits >= 5) this.text += ' ';
    this.text += glyph.symbol;
    for (const cb of this.listeners) cb(this.text);
  }

  onMeaning(cb: (text: string) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.text = '';
  }

  /** The transcript so far. */
  get value(): string {
    return this.text;
  }
}
