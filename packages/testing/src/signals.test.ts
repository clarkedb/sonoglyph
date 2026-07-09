import { describe, expect, it } from 'vitest';
import { whiteNoise } from '@sonoglyph/dsp';
import { fanRumble, pinkNoise, toneSequence } from './signals.js';

const SAMPLE_RATE = 48_000;

/**
 * Fraction of a signal's energy in sample-to-sample differences — a cheap
 * high-frequency proxy: white noise scores high, low-passed noise low.
 */
function roughness(samples: Float32Array): number {
  let diff = 0;
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i]! - samples[i - 1]!;
    diff += d * d;
    total += samples[i]! * samples[i]!;
  }
  return diff / total;
}

const peakOf = (samples: Float32Array) =>
  samples.reduce((peak, s) => Math.max(peak, Math.abs(s)), 0);

describe('toneSequence', () => {
  it('lays out lead-in, tones, gaps, and tail', () => {
    const signal = toneSequence([{ tones: [{ frequencyHz: 440 }] }], {
      leadInMs: 100,
      toneMs: 80,
      gapMs: 80,
      tailMs: 200,
    });
    expect(signal.length).toBe(Math.round(0.46 * SAMPLE_RATE));
    // Lead-in is silent, the tone region is not, the tail is silent.
    expect(peakOf(signal.subarray(0, 4800))).toBe(0);
    expect(peakOf(signal.subarray(4800, 4800 + 3840))).toBeGreaterThan(0.9);
    expect(peakOf(signal.subarray(signal.length - 9600))).toBe(0);
  });

  it('honors per-step duration and gap overrides', () => {
    const signal = toneSequence(
      [
        { tones: [{ frequencyHz: 440 }], durationMs: 30, gapMs: 10 },
        { tones: [{ frequencyHz: 880 }] },
      ],
      { leadInMs: 0, toneMs: 80, gapMs: 80, tailMs: 0 },
    );
    expect(signal.length).toBe(Math.round(0.2 * SAMPLE_RATE));
  });

  it('sums simultaneous tones into a chord', () => {
    const chord = toneSequence(
      [
        {
          tones: [
            { frequencyHz: 440, amplitude: 0.3 },
            { frequencyHz: 660, amplitude: 0.3 },
          ],
        },
      ],
      { leadInMs: 0, gapMs: 0, tailMs: 0 },
    );
    expect(peakOf(chord)).toBeGreaterThan(0.3);
    expect(peakOf(chord)).toBeLessThanOrEqual(0.6);
  });
});

describe('noise colors', () => {
  it('pink noise is deterministic per seed and normalized to the peak amplitude', () => {
    const a = pinkNoise(0.2, SAMPLE_RATE, 0.5, 7);
    const b = pinkNoise(0.2, SAMPLE_RATE, 0.5, 7);
    const c = pinkNoise(0.2, SAMPLE_RATE, 0.5, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(peakOf(a)).toBeCloseTo(0.5, 6);
  });

  it('pink noise has less high-frequency energy than white noise', () => {
    const white = whiteNoise(0.5, SAMPLE_RATE, 1, 7);
    const pink = pinkNoise(0.5, SAMPLE_RATE, 1, 7);
    expect(roughness(pink)).toBeLessThan(roughness(white) / 4);
  });

  it('fan rumble concentrates energy below its cutoff', () => {
    const rumble = fanRumble(0.5, SAMPLE_RATE, 0.3);
    expect(peakOf(rumble)).toBeCloseTo(0.3, 6);
    // One-pole at 200 Hz of 48 kHz noise: far smoother than white (~2.0),
    // though the gentle 6 dB/octave slope leaves some treble energy.
    expect(roughness(rumble)).toBeLessThan(0.1);
    // A higher cutoff lets more high-frequency energy through.
    const hiss = fanRumble(0.5, SAMPLE_RATE, 0.3, { cutoffHz: 4000 });
    expect(roughness(hiss)).toBeGreaterThan(roughness(rumble) * 5);
  });

  it('fan rumble is deterministic per seed', () => {
    expect(fanRumble(0.1, SAMPLE_RATE, 0.3, { seed: 5 })).toEqual(
      fanRumble(0.1, SAMPLE_RATE, 0.3, { seed: 5 }),
    );
  });
});
