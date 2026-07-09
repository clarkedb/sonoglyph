import { describe, expect, it } from 'vitest';
import type { Glyph } from '@sonoglyph/core';
import { STREAM_ENVELOPE } from '@sonoglyph/core';
import { mix, whiteNoise } from '@sonoglyph/dsp';
import type { ToneStep } from '@sonoglyph/testing';
import { decode, toneSequence } from '@sonoglyph/testing';
import { morseTiming } from './code.ts';
import type { MorseElementPayload } from './morse.ts';
import { MorseRecognizer } from './morse.ts';
import type { MorseTranscript } from './translator.ts';
import { MorseTextTranslator } from './translator.ts';

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

/** Every glyph's symbol, concatenated — glyphs are all elements now. */
const elements = (glyphs: Glyph[]) => glyphs.map((g) => g.symbol).join('');

/**
 * Morse cares about time resolution, not frequency resolution: the
 * envelope smears every key edge by the analysis window, and at the
 * default 2048 (~43 ms) the 1-unit gaps of brisk keying disappear
 * entirely. A 1024/256 engine is the right tool — the window-size
 * tradeoff from the DTMF docs, pulled the other way.
 */
const MORSE_ENGINE = { windowSize: 1024, hopSize: 256 };

const decodeElements = (signal: Float32Array, recognizer = new MorseRecognizer()) =>
  decode(signal, recognizer, { engineOptions: MORSE_ENGINE });

/** Decode audio all the way to meaning: elements → translator → transcript.
 * `flush` closes the final letter, which no following element can. */
function transcribe(signal: Float32Array, recognizer = new MorseRecognizer()): MorseTranscript {
  const translator = new MorseTextTranslator();
  for (const glyph of decodeElements(signal, recognizer)) translator.push(glyph);
  translator.flush();
  return translator.value;
}

describe('MorseRecognizer (elements off the envelope stream)', () => {
  it('emits one glyph per keyed element — dots and dashes, nothing else', () => {
    const glyphs = decodeElements(morseSignal('SOS'));
    expect(elements(glyphs)).toBe('...---...');
    expect(glyphs.every((g) => g.pluginId === 'morse')).toBe(true);
    // Every glyph is an element: it carries a `units` payload, never a code.
    expect(glyphs.every((g) => (g.payload as MorseElementPayload).units > 0)).toBe(true);
    expect(glyphs[0]!.confidence).toBeGreaterThan(0.8);
  });

  it('names elements by duration: ~1 unit is a dot, ~3 a dash', () => {
    const glyphs = decodeElements(morseSignal('ET')); // "." then "-"
    const [dot, dash] = glyphs;
    expect(dot!.symbol).toBe('.');
    expect(dash!.symbol).toBe('-');
    expect((dot!.payload as MorseElementPayload).units).toBeCloseTo(1, 0);
    expect((dash!.payload as MorseElementPayload).units).toBeCloseTo(3, 0);
  });

  it('ignores blips shorter than a viable dot', () => {
    const signal = toneSequence(
      [{ tones: [{ frequencyHz: 600, amplitude: 0.5 }], durationMs: 15 }],
      {
        sampleRate: SAMPLE_RATE,
        tailMs: 500,
      },
    );
    expect(decodeElements(signal)).toHaveLength(0);
  });

  it('stays silent below the level threshold', () => {
    expect(decodeElements(morseSignal('SOS', { amplitude: 0.01 }))).toHaveLength(0);
  });

  it('is frequency-blind — 300 Hz and 2 kHz key the same elements', () => {
    // The point of recognizing off the envelope: pitch carries no meaning.
    expect(elements(decodeElements(morseSignal('OK', { frequencyHz: 300 })))).toBe(
      elements(decodeElements(morseSignal('OK', { frequencyHz: 2000 }))),
    );
  });

  it('only consumes the envelope stream', () => {
    const recognizer = new MorseRecognizer();
    expect(recognizer.metadata.requiredStreams).toEqual([STREAM_ENVELOPE]);
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    recognizer.process({ stream: 'peaks', version: 1, time: 0, span: 0.04, hop: 0.01, data: {} });
    expect(glyphs).toHaveLength(0);
  });

  it('reset clears an in-progress element run', () => {
    const recognizer = new MorseRecognizer();
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    // Feed into the middle of a dash, then reset before it completes.
    const cut = morseSignal('T').subarray(0, Math.floor(0.2 * SAMPLE_RATE));
    decode(cut, recognizer, { engineOptions: MORSE_ENGINE });
    recognizer.reset();
    const after = decode(morseSignal('E'), recognizer, { engineOptions: MORSE_ENGINE });
    // Only the post-reset "E" (one dot) survives; the abandoned dash is gone.
    expect(elements(after)).toBe('.');
  });
});

describe('MorseTextTranslator (the Meaning layer: elements → letters → words)', () => {
  it('assembles element glyphs into letters', () => {
    const { text, letters } = transcribe(morseSignal('SOS'));
    expect(text).toBe('SOS');
    expect(letters.map((l) => l.code)).toEqual(['...', '---', '...']);
    expect(letters.map((l) => l.char)).toEqual(['S', 'O', 'S']);
  });

  it('decodes across the alphabet and digits', () => {
    expect(transcribe(morseSignal('THE QUICK BROWN FOX 1980')).text).toBe(
      'THE QUICK BROWN FOX 1980',
    );
  });

  it('reads word boundaries from the gaps between elements', () => {
    const { text, letters } = transcribe(morseSignal('HI U'));
    expect(text).toBe('HI U');
    expect(letters.map((l) => l.wordBreakBefore)).toEqual([false, false, true]);
  });

  it('adapts to the sender speed without configuration', () => {
    // 20 WPM (60 ms unit) and 12 WPM (100 ms unit), same default options.
    expect(transcribe(morseSignal('PARIS', { unitMs: 60 })).text).toBe('PARIS');
    expect(transcribe(morseSignal('PARIS', { unitMs: 100 })).text).toBe('PARIS');
  });

  it('flags unknown codes as "?" instead of dropping them', () => {
    // "........" (8 dots) is not a letter.
    const steps: ToneStep[] = Array.from({ length: 8 }, () => ({
      tones: [{ frequencyHz: 600, amplitude: 0.5 }],
      durationMs: 80,
      gapMs: 80,
    }));
    const signal = toneSequence(steps, { sampleRate: SAMPLE_RATE, tailMs: 500 });
    const { text, letters } = transcribe(signal);
    expect(text).toBe('?');
    expect(letters[0]!.code).toBe('........');
  });

  it('still decodes under added noise', () => {
    expect(transcribe(morseSignal('SOS', { noiseAmplitude: 0.03 })).text).toBe('SOS');
  });

  it('closePending() commits the current letter, before any next element', () => {
    const translator = new MorseTextTranslator();
    for (const glyph of decodeElements(morseSignal('R'))) translator.push(glyph); // ".-."
    expect(translator.hasPending).toBe(true);
    expect(translator.value.text).toBe('');
    translator.closePending();
    expect(translator.value.text).toBe('R');
    expect(translator.hasPending).toBe(false);
    // Idempotent: nothing pending, nothing added.
    translator.closePending();
    expect(translator.value.letters).toHaveLength(1);
  });

  it('needs flush to close the final letter (no following element ends it)', () => {
    const translator = new MorseTextTranslator();
    // "E" is a single dot: nothing follows it to prove the letter ended.
    for (const glyph of decodeElements(morseSignal('E'))) translator.push(glyph);
    expect(translator.value.text).toBe('');
    translator.flush();
    expect(translator.value.text).toBe('E');
  });

  it('emits the running transcript after every letter', () => {
    const translator = new MorseTextTranslator();
    const seen: string[] = [];
    translator.onMeaning((m) => seen.push(m.text));
    for (const glyph of decodeElements(morseSignal('HI'))) translator.push(glyph);
    translator.flush();
    expect(seen).toEqual(['H', 'HI']);
  });

  it('ignores glyphs from other plugins', () => {
    const translator = new MorseTextTranslator();
    translator.push({ symbol: '5', pluginId: 'dtmf', start: 0, duration: 0.1, confidence: 1 });
    translator.flush();
    expect(translator.value.text).toBe('');
    expect(translator.value.letters).toHaveLength(0);
  });

  it('reset clears the transcript', () => {
    const translator = new MorseTextTranslator();
    for (const glyph of decodeElements(morseSignal('OK'))) translator.push(glyph);
    translator.flush();
    expect(translator.value.letters.length).toBeGreaterThan(0);
    translator.reset();
    expect(translator.value.text).toBe('');
    expect(translator.value.letters).toHaveLength(0);
  });
});
