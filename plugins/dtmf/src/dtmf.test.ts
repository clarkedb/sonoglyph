import { describe, expect, it } from 'vitest';
import type { Glyph } from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import { mix, Pipeline, silence, TsDspEngine, whiteNoise } from '@sonoglyph/dsp';
import type { ToneStep } from '@sonoglyph/testing';
import { decode, fanRumble, symbols, toneSequence } from '@sonoglyph/testing';
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

/**
 * Synthesize a DTMF key sequence — the domain mapping (key → frequency
 * pair, deviation, twist) stays here; the signal layout comes from the
 * testing module's builders.
 */
function dtmfSignal(keys: string, opts: SignalOptions = {}): Float32Array {
  const {
    toneMs = 80,
    gapMs = 80,
    amplitude = 0.4,
    deviation = 0,
    noiseAmplitude = 0,
    highScale = 1,
  } = opts;

  const steps: ToneStep[] = [...keys].map((key) => {
    const { lowHz, highHz } = frequenciesFor(key as DtmfKey);
    return {
      tones: [
        { frequencyHz: lowHz * (1 + deviation), amplitude },
        { frequencyHz: highHz * (1 + deviation), amplitude: amplitude * highScale },
      ],
    };
  });

  let signal = toneSequence(steps, { sampleRate: SAMPLE_RATE, toneMs, gapMs });
  if (noiseAmplitude > 0) {
    signal = mix(signal, whiteNoise(signal.length / SAMPLE_RATE, SAMPLE_RATE, noiseAmplitude));
  }
  return signal;
}

const decodeDtmf = (signal: Float32Array) =>
  decode(signal, new DtmfRecognizer()) as Glyph<DtmfPayload>[];

describe('DtmfRecognizer (end to end on synthetic audio)', () => {
  it('decodes all 16 keys in sequence', () => {
    const glyphs = decodeDtmf(dtmfSignal('1234567890*#ABCD'));
    expect(symbols(glyphs)).toBe('1234567890*#ABCD');
  });

  it('emits confident glyphs with the detected frequency pair as payload', () => {
    const [glyph] = decodeDtmf(dtmfSignal('5'));
    expect(glyph).toBeDefined();
    expect(glyph!.pluginId).toBe('dtmf');
    expect(glyph!.confidence).toBeGreaterThan(0.8);
    expect(glyph!.payload!.nominalLowHz).toBe(770);
    expect(glyph!.payload!.nominalHighHz).toBe(1336);
    expect(Math.abs(glyph!.payload!.lowHz - 770)).toBeLessThan(3);
    expect(Math.abs(glyph!.payload!.highHz - 1336)).toBeLessThan(3);
  });

  it('reports plausible time spans', () => {
    const [glyph] = decodeDtmf(dtmfSignal('7', { toneMs: 100 }));
    expect(glyph).toBeDefined();
    // The tone starts after 100 ms of leading silence.
    expect(glyph!.start).toBeGreaterThan(0);
    expect(glyph!.start).toBeLessThan(0.2);
    expect(glyph!.duration).toBeGreaterThan(0.04);
    expect(glyph!.duration).toBeLessThan(0.25);
  });

  it('tolerates ±1.5% frequency deviation (ITU-T Q.24 must-accept)', () => {
    expect(symbols(decodeDtmf(dtmfSignal('159D', { deviation: 0.015 })))).toBe('159D');
    expect(symbols(decodeDtmf(dtmfSignal('159D', { deviation: -0.015 })))).toBe('159D');
  });

  it('rejects 4% frequency deviation (beyond must-reject threshold)', () => {
    expect(decodeDtmf(dtmfSignal('159D', { deviation: 0.04 }))).toHaveLength(0);
  });

  it('rejects tones shorter than the minimum duration', () => {
    expect(decodeDtmf(dtmfSignal('5555', { toneMs: 15 }))).toHaveLength(0);
  });

  it('separates back-to-back presses of the same key', () => {
    const glyphs = decodeDtmf(dtmfSignal('555', { toneMs: 80, gapMs: 80 }));
    expect(symbols(glyphs)).toBe('555');
    expect(glyphs[0]!.start).toBeLessThan(glyphs[1]!.start);
    expect(glyphs[1]!.start).toBeLessThan(glyphs[2]!.start);
  });

  it('still decodes under added white noise', () => {
    const glyphs = decodeDtmf(dtmfSignal('42*', { noiseAmplitude: 0.05 }));
    expect(symbols(glyphs)).toBe('42*');
  });

  it('rejects pairs with excessive twist', () => {
    expect(decodeDtmf(dtmfSignal('8', { highScale: 0.02 }))).toHaveLength(0);
  });

  it('decodes a quiet tone under loud low-frequency fan noise', () => {
    // A phone speaker across the room vs. a fan next to the mic: the tone
    // is 10× quieter than the rumble. Out-of-band peaks must not veto the
    // pair (they are outside `bandHz`) — without the band limit this level
    // does not decode. (Somewhere below ~0.02 the 43 ms window's own
    // physics gives out; that regime is the Phase 2 Goertzel comparison.)
    const signal = mix(dtmfSignal('3', { amplitude: 0.03 }), fanRumble(1, SAMPLE_RATE, 0.3));
    const glyphs = decodeDtmf(signal);
    expect(symbols(glyphs)).toBe('3');
    // Absorbed noise blips must not dilute the averaged payload: the
    // reported pair has to stay within the recognizer's own tolerance.
    const payload = glyphs[0]!.payload!;
    expect(Math.abs(payload.lowHz - 697)).toBeLessThan(697 * 0.02);
    expect(Math.abs(payload.highHz - 1477)).toBeLessThan(1477 * 0.02);
  });

  it('still rejects a pair drowned out by a louder in-band tone', () => {
    // 1000 Hz sits inside the DTMF band but matches no nominal; when it is
    // much louder than the pair, the frame is not a clean key press.
    const signal = toneSequence(
      [
        {
          tones: [
            { frequencyHz: 770, amplitude: 0.1 },
            { frequencyHz: 1336, amplitude: 0.1 },
            { frequencyHz: 1000, amplitude: 0.5 },
          ],
          durationMs: 100,
        },
      ],
      { sampleRate: SAMPLE_RATE, tailMs: 300 },
    );
    expect(decodeDtmf(signal)).toHaveLength(0);
  });

  it('ignores non-DTMF tone pairs', () => {
    const signal = toneSequence(
      [
        {
          tones: [
            { frequencyHz: 600, amplitude: 0.4 },
            { frequencyHz: 1800, amplitude: 0.4 },
          ],
          durationMs: 100,
        },
      ],
      { sampleRate: SAMPLE_RATE },
    );
    expect(decodeDtmf(signal)).toHaveLength(0);
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
