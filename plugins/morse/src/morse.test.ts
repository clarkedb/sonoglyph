import { describe, expect, it } from 'vitest';
import type { Glyph } from '@sonoglyph/core';
import { STREAM_ENVELOPE } from '@sonoglyph/core';
import { mix, whiteNoise } from '@sonoglyph/dsp';
import type { ToneStep } from '@sonoglyph/testing';
import { decode, toneSequence } from '@sonoglyph/testing';
import { morseTiming } from './code.js';
import type { MorseLetterPayload } from './morse.js';
import { MorseRecognizer } from './morse.js';
import { MorseTextTranslator } from './translator.js';

const SAMPLE_RATE = 48_000;

interface KeyOptions {
  unitMs?: number;
  frequencyHz?: number;
  amplitude?: number;
  noiseAmplitude?: number;
}

/**
 * Key a text as Morse audio: the domain mapping (text → on/off timing)
 * comes from the plugin's own `morseTiming`, the samples from the
 * testing module's builder — one ToneStep per key-down, with the
 * following silence as its gap.
 */
function morseSignal(text: string, opts: KeyOptions = {}): Float32Array {
  const { unitMs = 80, frequencyHz = 600, amplitude = 0.5, noiseAmplitude = 0 } = opts;
  const segments = morseTiming(text);
  const steps: ToneStep[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i]!.on) continue;
    const gap = segments[i + 1]?.on === false ? segments[i + 1]!.units : 0;
    steps.push({
      tones: [{ frequencyHz, amplitude }],
      durationMs: segments[i]!.units * unitMs,
      gapMs: gap * unitMs,
    });
  }
  let signal = toneSequence(steps, { sampleRate: SAMPLE_RATE, tailMs: 6 * unitMs });
  if (noiseAmplitude > 0) {
    signal = mix(signal, whiteNoise(signal.length / SAMPLE_RATE, SAMPLE_RATE, noiseAmplitude));
  }
  return signal;
}

/** Letters only (elements filtered out), concatenated. */
const letters = (glyphs: Glyph[]) =>
  glyphs
    .filter((g) => (g.payload as MorseLetterPayload | undefined)?.code)
    .map((g) => g.symbol)
    .join('');

/** Elements only, concatenated: the raw dots and dashes. */
const elements = (glyphs: Glyph[]) =>
  glyphs
    .filter((g) => g.symbol === '.' || g.symbol === '-')
    .map((g) => g.symbol)
    .join('');

/**
 * Morse cares about time resolution, not frequency resolution: the
 * envelope smears every key edge by the analysis window, and at the
 * default 2048 (~43 ms) the 1-unit gaps of brisk keying disappear
 * entirely. A 1024/256 engine is the right tool — the window-size
 * tradeoff from the DTMF docs, pulled the other way.
 */
const MORSE_ENGINE = { windowSize: 1024, hopSize: 256 };

const decodeMorse = (signal: Float32Array, recognizer = new MorseRecognizer()) =>
  decode(signal, recognizer, { engineOptions: MORSE_ENGINE });

/** Decode audio all the way to text through the Meaning layer. */
function decodeText(signal: Float32Array, recognizer = new MorseRecognizer()): string {
  const translator = new MorseTextTranslator();
  const glyphs = decodeMorse(signal, recognizer);
  for (const glyph of glyphs) translator.push(glyph);
  return translator.value;
}

describe('MorseRecognizer (end to end on synthetic audio)', () => {
  it('emits dots, dashes, and letters as glyphs', () => {
    const glyphs = decodeMorse(morseSignal('SOS'), new MorseRecognizer());
    expect(elements(glyphs)).toBe('...---...');
    expect(letters(glyphs)).toBe('SOS');
    const s = glyphs.find((g) => g.symbol === 'S')!;
    expect(s.pluginId).toBe('morse');
    expect((s.payload as MorseLetterPayload).code).toBe('...');
    expect(s.confidence).toBeGreaterThan(0.8);
  });

  it('reports element durations in units', () => {
    const glyphs = decodeMorse(morseSignal('ET'), new MorseRecognizer());
    const [dot, dash] = glyphs.filter((g) => g.symbol === '.' || g.symbol === '-');
    expect((dot!.payload as { units: number }).units).toBeCloseTo(1, 0);
    expect((dash!.payload as { units: number }).units).toBeCloseTo(3, 0);
  });

  it('decodes across the alphabet and digits', () => {
    const glyphs = decodeMorse(morseSignal('THE QUICK BROWN FOX 1980'), new MorseRecognizer());
    expect(letters(glyphs)).toBe('THEQUICKBROWNFOX1980');
  });

  it('marks word gaps for the Meaning layer', () => {
    const glyphs = decodeMorse(morseSignal('HI U'), new MorseRecognizer());
    const letterGlyphs = glyphs.filter((g) => (g.payload as MorseLetterPayload | undefined)?.code);
    const gaps = letterGlyphs.map((g) => (g.payload as MorseLetterPayload).gapUnits);
    expect(gaps[0]).toBe(Number.POSITIVE_INFINITY); // first letter
    expect(gaps[1]).toBeGreaterThan(2); // H→I letter gap ~3
    expect(gaps[1]).toBeLessThan(5);
    expect(gaps[2]).toBeGreaterThanOrEqual(5); // I→U word gap ~7
  });

  it('adapts to the sender speed without configuration', () => {
    // 20 WPM (60 ms unit) and 12 WPM (100 ms unit) with the same default
    // options: the unit estimate follows the keying.
    expect(letters(decodeMorse(morseSignal('PARIS', { unitMs: 60 }), new MorseRecognizer()))).toBe(
      'PARIS',
    );
    expect(letters(decodeMorse(morseSignal('PARIS', { unitMs: 100 }), new MorseRecognizer()))).toBe(
      'PARIS',
    );
  });

  it('flags unknown codes as "?" instead of dropping them', () => {
    // "........" (8 dots) is not a letter.
    const steps: ToneStep[] = Array.from({ length: 8 }, () => ({
      tones: [{ frequencyHz: 600, amplitude: 0.5 }],
      durationMs: 80,
      gapMs: 80,
    }));
    const signal = toneSequence(steps, { sampleRate: SAMPLE_RATE, tailMs: 500 });
    const glyphs = decodeMorse(signal, new MorseRecognizer());
    const letterGlyphs = glyphs.filter((g) => (g.payload as MorseLetterPayload | undefined)?.code);
    expect(letterGlyphs).toHaveLength(1);
    expect(letterGlyphs[0]!.symbol).toBe('?');
    expect((letterGlyphs[0]!.payload as MorseLetterPayload).code).toBe('........');
  });

  it('ignores blips shorter than a viable dot', () => {
    const signal = toneSequence(
      [{ tones: [{ frequencyHz: 600, amplitude: 0.5 }], durationMs: 15 }],
      { sampleRate: SAMPLE_RATE, tailMs: 500 },
    );
    expect(decodeMorse(signal, new MorseRecognizer())).toHaveLength(0);
  });

  it('stays silent below the level threshold', () => {
    const signal = morseSignal('SOS', { amplitude: 0.01 });
    expect(decodeMorse(signal, new MorseRecognizer())).toHaveLength(0);
  });

  it('still decodes under added noise', () => {
    const glyphs = decodeMorse(morseSignal('SOS', { noiseAmplitude: 0.03 }), new MorseRecognizer());
    expect(letters(glyphs)).toBe('SOS');
  });

  it('does not care what frequency the tone is', () => {
    // Envelope recognition is frequency-blind: 300 Hz and 2 kHz decode
    // identically. That is the point of the stream.
    expect(
      letters(decodeMorse(morseSignal('OK', { frequencyHz: 300 }), new MorseRecognizer())),
    ).toBe('OK');
    expect(
      letters(decodeMorse(morseSignal('OK', { frequencyHz: 2000 }), new MorseRecognizer())),
    ).toBe('OK');
  });

  it('only consumes the envelope stream', () => {
    const recognizer = new MorseRecognizer();
    expect(recognizer.metadata.requiredStreams).toEqual([STREAM_ENVELOPE]);
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    recognizer.process({ stream: 'peaks', version: 1, time: 0, span: 0.04, hop: 0.01, data: {} });
    expect(glyphs).toHaveLength(0);
  });

  it('reset clears pending elements and letters', () => {
    const recognizer = new MorseRecognizer();
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    // Feed most of an "E" (dot) but reset before the letter gap closes.
    const signal = morseSignal('E');
    const cut = signal.subarray(0, Math.floor(0.2 * SAMPLE_RATE));
    decodeMorse(cut, recognizer);
    recognizer.reset();
    const after = decodeMorse(morseSignal('T'), recognizer);
    expect(letters(after)).toBe('T');
    expect(glyphs.filter((g) => g.symbol === 'E')).toHaveLength(0);
  });
});

describe('MorseTextTranslator (the Meaning layer)', () => {
  it('assembles letters into words using gap payloads', () => {
    expect(decodeText(morseSignal('HELLO WORLD'))).toBe('HELLO WORLD');
  });

  it('emits the running transcript after every letter', () => {
    const translator = new MorseTextTranslator();
    const transcripts: string[] = [];
    translator.onMeaning((text) => transcripts.push(text));
    const glyphs = decodeMorse(morseSignal('HI'), new MorseRecognizer());
    for (const glyph of glyphs) translator.push(glyph);
    expect(transcripts).toEqual(['H', 'HI']);
  });

  it('ignores glyphs from other plugins', () => {
    const translator = new MorseTextTranslator();
    translator.push({ symbol: '5', pluginId: 'dtmf', start: 0, duration: 0.1, confidence: 1 });
    expect(translator.value).toBe('');
  });

  it('reset clears the transcript', () => {
    const translator = new MorseTextTranslator();
    const glyphs = decodeMorse(morseSignal('OK'), new MorseRecognizer());
    for (const glyph of glyphs) translator.push(glyph);
    translator.reset();
    expect(translator.value).toBe('');
  });
});
