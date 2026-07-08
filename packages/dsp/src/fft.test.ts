import { describe, expect, it } from 'vitest';
import { Fft } from './fft.js';
import { sine, whiteNoise } from './generate.js';

/** Naive O(N²) DFT used as the ground truth. */
function naiveDft(signal: Float32Array): { re: number[]; im: number[] } {
  const n = signal.length;
  const re: number[] = [];
  const im: number[] = [];
  for (let k = 0; k < n; k++) {
    let sumRe = 0;
    let sumIm = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      sumRe += signal[t]! * Math.cos(angle);
      sumIm += signal[t]! * Math.sin(angle);
    }
    re.push(sumRe);
    im.push(sumIm);
  }
  return { re, im };
}

describe('Fft', () => {
  it('rejects non-power-of-two sizes', () => {
    expect(() => new Fft(100)).toThrow(/power of two/);
  });

  it('transforms an impulse to a flat spectrum', () => {
    const n = 64;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    re[0] = 1;
    new Fft(n).transform(re, im);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(1, 5);
      expect(im[k]).toBeCloseTo(0, 5);
    }
  });

  it('puts a bin-aligned sine exactly in its bin', () => {
    const n = 256;
    const bin = 10;
    // Frequency chosen so exactly `bin` cycles fit the window.
    const signal = sine(bin, 1, n); // sampleRate = n → bin cycles per window
    const mags = new Fft(n).magnitudes(signal, n / 2);
    for (let k = 0; k <= n / 2; k++) {
      if (k === bin) expect(mags[k]).toBeCloseTo(1, 4);
      else expect(mags[k]!).toBeLessThan(1e-4);
    }
  });

  it('matches a naive DFT on random input', () => {
    const n = 256;
    const signal = whiteNoise(1, n, 1, 42); // n samples
    const re = new Float32Array(signal);
    const im = new Float32Array(n);
    new Fft(n).transform(re, im);
    const truth = naiveDft(signal);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(truth.re[k]!, 2);
      expect(im[k]).toBeCloseTo(truth.im[k]!, 2);
    }
  });

  it('satisfies Parseval: energy in time equals energy in frequency / N', () => {
    const n = 512;
    const signal = whiteNoise(1, n, 0.5, 7);
    let timeEnergy = 0;
    for (const s of signal) timeEnergy += s * s;

    const re = new Float32Array(signal);
    const im = new Float32Array(n);
    new Fft(n).transform(re, im);
    let freqEnergy = 0;
    for (let k = 0; k < n; k++) freqEnergy += re[k]! * re[k]! + im[k]! * im[k]!;

    expect(freqEnergy / n).toBeCloseTo(timeEnergy, 2);
  });
});
