import { describe, expect, it } from 'vitest';
import { goertzelMagnitude, goertzelPower } from './goertzel.js';
import { sine, tones, whiteNoise } from './generate.js';

const SAMPLE_RATE = 48_000;

describe('goertzelMagnitude', () => {
  it('measures ~1.0 for a full-scale sine at the probed frequency', () => {
    // 750 Hz lands exactly on a bin for N = 1024 at 48 kHz (bin width
    // 46.875 Hz, 750 = 16 bins), so there is no scalloping loss.
    const block = sine(750, 1024 / SAMPLE_RATE, SAMPLE_RATE);
    expect(goertzelMagnitude(block, 750, SAMPLE_RATE)).toBeCloseTo(1, 2);
  });

  it('scales linearly with amplitude', () => {
    const block = sine(750, 1024 / SAMPLE_RATE, SAMPLE_RATE, 0.25);
    expect(goertzelMagnitude(block, 750, SAMPLE_RATE)).toBeCloseTo(0.25, 2);
  });

  it('measures ~0 away from the tone', () => {
    const block = sine(750, 1024 / SAMPLE_RATE, SAMPLE_RATE);
    expect(goertzelMagnitude(block, 1336, SAMPLE_RATE)).toBeLessThan(0.02);
  });

  it('does not require the frequency to land on a bin', () => {
    // 770 Hz is between bins for N = 1024; the probe is still centered on
    // it, so the measurement stays near full scale.
    const block = sine(770, 1024 / SAMPLE_RATE, SAMPLE_RATE);
    expect(goertzelMagnitude(block, 770, SAMPLE_RATE)).toBeGreaterThan(0.95);
  });

  it('separates the two tones of a pair', () => {
    const block = tones(
      [
        { frequencyHz: 770, amplitude: 0.4 },
        { frequencyHz: 1336, amplitude: 0.4 },
      ],
      1024 / SAMPLE_RATE,
      SAMPLE_RATE,
    );
    expect(goertzelMagnitude(block, 770, SAMPLE_RATE)).toBeCloseTo(0.4, 1);
    expect(goertzelMagnitude(block, 1336, SAMPLE_RATE)).toBeCloseTo(0.4, 1);
    expect(goertzelMagnitude(block, 941, SAMPLE_RATE)).toBeLessThan(0.05);
  });

  it('selectivity narrows with block length', () => {
    // A 697 Hz probe against a 770 Hz tone: a short block cannot tell
    // them apart, a long one can (main lobe ~2·fs/N wide).
    const tone = sine(770, 0.1, SAMPLE_RATE);
    const short = goertzelMagnitude(tone.subarray(0, 256), 697, SAMPLE_RATE);
    const long = goertzelMagnitude(tone.subarray(0, 2048), 697, SAMPLE_RATE);
    expect(short).toBeGreaterThan(0.3);
    expect(long).toBeLessThan(0.1);
  });

  it('stays finite on noise', () => {
    const block = whiteNoise(1024 / SAMPLE_RATE, SAMPLE_RATE, 0.5, 3);
    const magnitude = goertzelMagnitude(block, 1000, SAMPLE_RATE);
    expect(Number.isFinite(magnitude)).toBe(true);
    expect(magnitude).toBeGreaterThanOrEqual(0);
  });
});

describe('goertzelPower', () => {
  it('is the squared magnitude (~A² at the tone)', () => {
    const block = sine(750, 1024 / SAMPLE_RATE, SAMPLE_RATE, 0.5);
    expect(goertzelPower(block, 750, SAMPLE_RATE)).toBeCloseTo(0.25, 2);
  });
});
