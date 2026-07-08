import type { WindowName } from '@sonoglyph/core';

/**
 * Window functions.
 *
 * An FFT assumes its input repeats forever; a raw slice of signal almost
 * never lines up with itself, and the resulting discontinuity smears energy
 * across the whole spectrum ("spectral leakage"). Multiplying the slice by a
 * window that tapers to zero at the edges removes the discontinuity at the
 * cost of widening each spectral peak — the fundamental windowing tradeoff.
 */

/** Compute one window sample. `i` in [0, n), periodic form (denominator n). */
function windowSample(name: WindowName, i: number, n: number): number {
  const x = (2 * Math.PI * i) / n;
  switch (name) {
    case 'rectangular':
      return 1;
    case 'hann':
      return 0.5 - 0.5 * Math.cos(x);
    case 'hamming':
      return 0.54 - 0.46 * Math.cos(x);
    case 'blackman':
      return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
}

/** Build a window of length `size`. */
export function makeWindow(name: WindowName, size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = windowSample(name, i, size);
  return w;
}

/** Sum of the window's samples — used to normalize FFT magnitudes so a
 * full-scale sine reads as ~1.0 regardless of window choice. */
export function windowSum(window: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < window.length; i++) sum += window[i]!;
  return sum;
}

export const WINDOW_NAMES: WindowName[] = ['rectangular', 'hann', 'hamming', 'blackman'];
