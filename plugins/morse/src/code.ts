/**
 * International Morse code (ITU-R M.1677-1). Timing is measured in
 * units: a dot is 1 unit on, a dash 3 units on, the gap inside a letter
 * 1 unit off, between letters 3 units, between words 7 units.
 */

export const MORSE_CODE: Readonly<Record<string, string>> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  '/': '-..-.',
  '=': '-...-',
};

/** code → character, e.g. ".-" → "A". */
const DECODE: ReadonlyMap<string, string> = new Map(
  Object.entries(MORSE_CODE).map(([char, code]) => [code, char]),
);

/** The character for a dot/dash code, or undefined if it isn't one. */
export function charFor(code: string): string | undefined {
  return DECODE.get(code);
}

/**
 * Encode text as Morse: letters become dot/dash runs, letters are
 * separated by spaces, words by " / ". Characters without a code are
 * dropped. `textToMorse('HI U') === '.... .. / ..-'`
 */
export function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      [...word]
        .map((char) => MORSE_CODE[char])
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(' / ');
}

/** One keyed segment of a Morse transmission. */
export interface MorseSegment {
  /** True while the key is down (tone sounding). */
  on: boolean;
  /** Segment length in timing units (dot = 1, dash = 3, …). */
  units: number;
}

/**
 * The on/off keying timeline for a text, in timing units — the shared
 * ground truth for synthesis (tests, the playground keyer) and a
 * readable spec of the timing rules in one place.
 */
export function morseTiming(text: string): MorseSegment[] {
  const segments: MorseSegment[] = [];
  // Words with no encodable characters are dropped entirely — the same
  // rule textToMorse applies — so unknown symbols cannot leave phantom
  // word gaps in the timeline.
  const words = text
    .toUpperCase()
    .split(/\s+/)
    .map((word) => [...word].filter((char) => MORSE_CODE[char]).join(''))
    .filter(Boolean);
  words.forEach((word, w) => {
    if (w > 0) segments.push({ on: false, units: 7 });
    let firstInWord = true;
    for (const char of word) {
      const code = MORSE_CODE[char];
      if (!code) continue;
      if (!firstInWord) segments.push({ on: false, units: 3 });
      firstInWord = false;
      [...code].forEach((element, i) => {
        if (i > 0) segments.push({ on: false, units: 1 });
        segments.push({ on: true, units: element === '-' ? 3 : 1 });
      });
    }
  });
  return segments;
}
