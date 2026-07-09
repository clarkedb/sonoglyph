import { describe, expect, it } from 'vitest';
import { Fft } from './fft.ts';
import { sine, tones } from './generate.ts';
import { detectPeaks } from './peaks.ts';
import { makeWindow, windowSum } from './window.ts';

const SAMPLE_RATE = 48_000;
const N = 4096;
const BIN_HZ = SAMPLE_RATE / N;

function spectrumOf(signal: Float32Array): Float32Array {
  const window = makeWindow('hann', N);
  const windowed = new Float32Array(N);
  for (let i = 0; i < N; i++) windowed[i] = signal[i]! * window[i]!;
  return new Fft(N).magnitudes(windowed, windowSum(window) / 2);
}

describe('detectPeaks', () => {
  it('recovers an off-bin frequency to well under one bin', () => {
    // 697 Hz is DTMF row 1; at ~11.7 Hz bins it falls between bins.
    const freq = 697;
    const mags = spectrumOf(sine(freq, 1, SAMPLE_RATE));
    const peaks = detectPeaks(mags, { binHz: BIN_HZ });
    expect(peaks.length).toBeGreaterThan(0);
    expect(Math.abs(peaks[0]!.frequencyHz - freq)).toBeLessThan(BIN_HZ / 4);
    expect(peaks[0]!.magnitude).toBeCloseTo(1, 1);
  });

  it('finds both tones of a DTMF pair, strongest first', () => {
    const signal = tones(
      [
        { frequencyHz: 770, amplitude: 0.5 },
        { frequencyHz: 1336, amplitude: 0.4 },
      ],
      1,
      SAMPLE_RATE,
    );
    const peaks = detectPeaks(spectrumOf(signal), { binHz: BIN_HZ });
    expect(peaks.length).toBe(2);
    expect(Math.abs(peaks[0]!.frequencyHz - 770)).toBeLessThan(2);
    expect(Math.abs(peaks[1]!.frequencyHz - 1336)).toBeLessThan(2);
  });

  it('returns nothing for silence', () => {
    const mags = new Float32Array(N / 2 + 1);
    expect(detectPeaks(mags, { binHz: BIN_HZ })).toEqual([]);
  });

  it('respects maxPeaks', () => {
    const signal = tones(
      [500, 800, 1100, 1400, 1700, 2000].map((frequencyHz) => ({ frequencyHz, amplitude: 0.3 })),
      1,
      SAMPLE_RATE,
    );
    const peaks = detectPeaks(spectrumOf(signal), { binHz: BIN_HZ, maxPeaks: 3 });
    expect(peaks.length).toBe(3);
  });
});
