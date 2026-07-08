import { describe, expect, it } from 'vitest';
import type { Glyph } from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import { concat, mix, Pipeline, silence, tones, TsDspEngine, whiteNoise } from '@sonoglyph/dsp';
import type { DtmfPayload } from './dtmf.js';
import { DtmfRecognizer } from './dtmf.js';
import type { DtmfKey } from './frequencies.js';
import { frequenciesFor } from './frequencies.js';

const SAMPLE_RATE = 48_000;

interface SignalOptions {
  toneMs?: number;
  gapMs?: number;
  amplitude?: number;
  /** Fractional frequency deviation applied to both tones (e.g. 0.015). */
  deviation?: number;
  /** Peak amplitude of added white noise. */
  noiseAmplitude?: number;
  /** Scale the high tone relative to the low tone (twist). */
  highScale?: number;
}

/** Synthesize a DTMF key sequence — the integration tests' only input. */
function dtmfSignal(keys: string, opts: SignalOptions = {}): Float32Array {
  const {
    toneMs = 80,
    gapMs = 80,
    amplitude = 0.4,
    deviation = 0,
    noiseAmplitude = 0,
    highScale = 1,
  } = opts;

  const parts: Float32Array[] = [silence(0.1, SAMPLE_RATE)];
  for (const key of keys) {
    const { lowHz, highHz } = frequenciesFor(key as DtmfKey);
    parts.push(
      tones(
        [
          { frequencyHz: lowHz * (1 + deviation), amplitude },
          { frequencyHz: highHz * (1 + deviation), amplitude: amplitude * highScale },
        ],
        toneMs / 1000,
        SAMPLE_RATE,
      ),
      silence(gapMs / 1000, SAMPLE_RATE),
    );
  }
  // Trailing silence so the last press's gap threshold is reached.
  parts.push(silence(0.2, SAMPLE_RATE));

  let signal = concat(...parts);
  if (noiseAmplitude > 0) {
    signal = mix(signal, whiteNoise(signal.length / SAMPLE_RATE, SAMPLE_RATE, noiseAmplitude));
  }
  return signal;
}

/**
 * Feed a signal through the exact pipeline the microphone uses — engine
 * defaults, 128-sample chunks like an AudioWorklet delivers.
 */
function decode(signal: Float32Array, recognizer = new DtmfRecognizer()): Glyph<DtmfPayload>[] {
  const pipeline = new Pipeline(new TsDspEngine({ sampleRate: SAMPLE_RATE }));
  pipeline.addPlugin(recognizer);
  const glyphs: Glyph<DtmfPayload>[] = [];
  pipeline.onGlyph((g) => glyphs.push(g as Glyph<DtmfPayload>));
  for (let i = 0; i < signal.length; i += 128) {
    pipeline.push(signal.subarray(i, Math.min(i + 128, signal.length)));
  }
  return glyphs;
}

const symbols = (glyphs: Glyph[]) => glyphs.map((g) => g.symbol).join('');

describe('DtmfRecognizer (end to end on synthetic audio)', () => {
  it('decodes all 16 keys in sequence', () => {
    const glyphs = decode(dtmfSignal('1234567890*#ABCD'));
    expect(symbols(glyphs)).toBe('1234567890*#ABCD');
  });

  it('emits confident glyphs with the detected frequency pair as payload', () => {
    const [glyph] = decode(dtmfSignal('5'));
    expect(glyph).toBeDefined();
    expect(glyph!.pluginId).toBe('dtmf');
    expect(glyph!.confidence).toBeGreaterThan(0.8);
    expect(glyph!.payload!.nominalLowHz).toBe(770);
    expect(glyph!.payload!.nominalHighHz).toBe(1336);
    expect(Math.abs(glyph!.payload!.lowHz - 770)).toBeLessThan(3);
    expect(Math.abs(glyph!.payload!.highHz - 1336)).toBeLessThan(3);
  });

  it('reports plausible time spans', () => {
    const [glyph] = decode(dtmfSignal('7', { toneMs: 100 }));
    expect(glyph).toBeDefined();
    // The tone starts after 100 ms of leading silence.
    expect(glyph!.start).toBeGreaterThan(0);
    expect(glyph!.start).toBeLessThan(0.2);
    expect(glyph!.duration).toBeGreaterThan(0.04);
    expect(glyph!.duration).toBeLessThan(0.25);
  });

  it('tolerates ±1.5% frequency deviation (ITU-T Q.24 must-accept)', () => {
    expect(symbols(decode(dtmfSignal('159D', { deviation: 0.015 })))).toBe('159D');
    expect(symbols(decode(dtmfSignal('159D', { deviation: -0.015 })))).toBe('159D');
  });

  it('rejects 4% frequency deviation (beyond must-reject threshold)', () => {
    expect(decode(dtmfSignal('159D', { deviation: 0.04 }))).toHaveLength(0);
  });

  it('rejects tones shorter than the minimum duration', () => {
    expect(decode(dtmfSignal('5555', { toneMs: 15 }))).toHaveLength(0);
  });

  it('separates back-to-back presses of the same key', () => {
    const glyphs = decode(dtmfSignal('555', { toneMs: 80, gapMs: 80 }));
    expect(symbols(glyphs)).toBe('555');
    expect(glyphs[0]!.start).toBeLessThan(glyphs[1]!.start);
    expect(glyphs[1]!.start).toBeLessThan(glyphs[2]!.start);
  });

  it('still decodes under added white noise', () => {
    const glyphs = decode(dtmfSignal('42*', { noiseAmplitude: 0.05 }));
    expect(symbols(glyphs)).toBe('42*');
  });

  it('rejects pairs with excessive twist', () => {
    expect(decode(dtmfSignal('8', { highScale: 0.02 }))).toHaveLength(0);
  });

  it('ignores non-DTMF tone pairs', () => {
    const signal = concat(
      silence(0.1, SAMPLE_RATE),
      tones(
        [
          { frequencyHz: 600, amplitude: 0.4 },
          { frequencyHz: 1800, amplitude: 0.4 },
        ],
        0.1,
        SAMPLE_RATE,
      ),
      silence(0.2, SAMPLE_RATE),
    );
    expect(decode(signal)).toHaveLength(0);
  });

  it('reset clears an in-progress press', () => {
    const recognizer = new DtmfRecognizer();
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));

    const pipeline = new Pipeline(new TsDspEngine({ sampleRate: SAMPLE_RATE }));
    pipeline.addPlugin(recognizer);
    // Push up to the middle of the tone (0.1 s silence + 40 ms of tone),
    // then reset mid-press.
    pipeline.push(dtmfSignal('1', { gapMs: 0 }).subarray(0, Math.floor(0.14 * SAMPLE_RATE)));
    pipeline.reset();
    pipeline.push(silence(0.3, SAMPLE_RATE));
    expect(glyphs).toHaveLength(0);
  });

  it('only consumes the peaks stream', () => {
    const recognizer = new DtmfRecognizer();
    expect(recognizer.metadata.requiredStreams).toEqual([STREAM_PEAKS]);
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    recognizer.process({
      stream: 'envelope',
      version: 1,
      time: 0,
      span: 0.04,
      hop: 0.02,
      data: {},
    });
    expect(glyphs).toHaveLength(0);
  });
});
