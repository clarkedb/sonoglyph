import { describe, expect, it } from 'vitest';
import type { Glyph } from '@sonoglyph/core';
import { STREAM_SAMPLES } from '@sonoglyph/core';
import { mix, whiteNoise } from '@sonoglyph/dsp';
import type { ToneStep } from '@sonoglyph/testing';
import { decode, fanRumble, symbols, toneSequence } from '@sonoglyph/testing';
import { DtmfRecognizer } from './dtmf.ts';
import type { DtmfKey } from './frequencies.ts';
import { frequenciesFor } from './frequencies.ts';
import type { GoertzelDtmfPayload } from './goertzel-dtmf.ts';
import { GoertzelDtmfRecognizer } from './goertzel-dtmf.ts';

const SAMPLE_RATE = 48_000;

interface SignalOptions {
  toneMs?: number;
  gapMs?: number;
  amplitude?: number;
  deviation?: number;
  noiseAmplitude?: number;
  highScale?: number;
}

/** Same synthesis the FFT recognizer's tests use — same signals, second strategy. */
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

const decodeGoertzel = (signal: Float32Array) =>
  decode(signal, new GoertzelDtmfRecognizer()) as Glyph<GoertzelDtmfPayload>[];

describe('GoertzelDtmfRecognizer (end to end on synthetic audio)', () => {
  it('decodes all 16 keys in sequence', () => {
    const glyphs = decodeGoertzel(dtmfSignal('1234567890*#ABCD'));
    expect(symbols(glyphs)).toBe('1234567890*#ABCD');
  });

  it('emits confident glyphs with the matched nominal pair as payload', () => {
    const [glyph] = decodeGoertzel(dtmfSignal('5'));
    expect(glyph).toBeDefined();
    expect(glyph!.pluginId).toBe('dtmf-goertzel');
    expect(glyph!.confidence).toBeGreaterThan(0.7);
    expect(glyph!.payload!.nominalLowHz).toBe(770);
    expect(glyph!.payload!.nominalHighHz).toBe(1336);
    // A clean pair sits far above the guard-probe noise floor.
    expect(glyph!.payload!.snrDb).toBeGreaterThan(20);
    expect(Math.abs(glyph!.payload!.twistDb)).toBeLessThan(3);
  });

  it('tolerates ±1.5% frequency deviation (ITU-T Q.24 must-accept)', () => {
    expect(symbols(decodeGoertzel(dtmfSignal('159D', { deviation: 0.015 })))).toBe('159D');
    expect(symbols(decodeGoertzel(dtmfSignal('159D', { deviation: -0.015 })))).toBe('159D');
  });

  it('rejects 4% frequency deviation (beyond must-reject threshold)', () => {
    expect(decodeGoertzel(dtmfSignal('159D', { deviation: 0.04 }))).toHaveLength(0);
  });

  it('rejects tones shorter than the minimum duration', () => {
    expect(decodeGoertzel(dtmfSignal('5555', { toneMs: 15 }))).toHaveLength(0);
  });

  it('separates back-to-back presses of the same key', () => {
    expect(symbols(decodeGoertzel(dtmfSignal('555')))).toBe('555');
  });

  it('still decodes under added white noise', () => {
    expect(symbols(decodeGoertzel(dtmfSignal('42*', { noiseAmplitude: 0.05 })))).toBe('42*');
  });

  it('rejects pairs with excessive twist', () => {
    expect(decodeGoertzel(dtmfSignal('8', { highScale: 0.02 }))).toHaveLength(0);
  });

  it('decodes the deep-noise regime where the FFT recognizer gives out', () => {
    // 20:1 noise-to-tone — twice as deep as the FFT recognizer's
    // documented ~10:1 fan-noise limit. Probing exactly the 8 nominals
    // has no peak-picking step to lose in a noisy spectrum, which is the
    // entire reason real DTMF decoders use Goertzel.
    const signal = mix(dtmfSignal('3', { amplitude: 0.015 }), fanRumble(1, SAMPLE_RATE, 0.3));
    expect(symbols(decodeGoertzel(signal))).toBe('3');
    // The comparison the playground toggle demonstrates: the FFT
    // recognizer does not decode this signal. If it ever starts to, this
    // plugin's headline claim needs rewording — celebrate, then update.
    expect(decode(signal, new DtmfRecognizer())).toHaveLength(0);
  });

  it('separates a rumble-adjacent tone from the noise floor it hides in', () => {
    // Key 5's 770 Hz sits right next to the rumble shoulder, where the
    // in-probe noise rivals the tone — raw ranking would hand these
    // frames to the chronically hot 697 probe. The tracked per-probe
    // noise floor is what tells "hot because the room is hot" from "hot
    // because a tone just started".
    const signal = mix(dtmfSignal('5', { amplitude: 0.025 }), fanRumble(1, SAMPLE_RATE, 0.3));
    expect(symbols(decodeGoertzel(signal))).toBe('5');
    expect(decode(signal, new DtmfRecognizer())).toHaveLength(0);
  });

  it('still rejects a pair drowned out by a louder in-band tone', () => {
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
      { sampleRate: SAMPLE_RATE },
    );
    expect(decodeGoertzel(signal)).toHaveLength(0);
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
    expect(decodeGoertzel(signal)).toHaveLength(0);
  });

  it('agrees with the FFT recognizer on clean input', () => {
    const signal = dtmfSignal('8675309');
    const fft = decode(signal, new DtmfRecognizer());
    const goertzel = decode(signal, new GoertzelDtmfRecognizer());
    expect(symbols(goertzel)).toBe(symbols(fft));
  });

  it('only consumes the samples stream', () => {
    const recognizer = new GoertzelDtmfRecognizer();
    expect(recognizer.metadata.requiredStreams).toEqual([STREAM_SAMPLES]);
    const glyphs: Glyph[] = [];
    recognizer.onGlyph((g) => glyphs.push(g));
    recognizer.process({ stream: 'peaks', version: 1, time: 0, span: 0.04, hop: 0.01, data: {} });
    expect(glyphs).toHaveLength(0);
  });
});
