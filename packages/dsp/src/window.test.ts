import { describe, expect, it } from 'vitest';
import { makeWindow, windowSum, WINDOW_NAMES } from './window.ts';

describe('makeWindow', () => {
  it('rectangular is all ones', () => {
    const w = makeWindow('rectangular', 8);
    expect(Array.from(w)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('hann starts at zero and peaks at 1 mid-window', () => {
    const n = 256;
    const w = makeWindow('hann', n);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[n / 2]).toBeCloseTo(1, 6);
  });

  it('periodic windows are symmetric about the center sample', () => {
    const n = 64;
    for (const name of WINDOW_NAMES) {
      const w = makeWindow(name, n);
      for (let i = 1; i < n / 2; i++) {
        expect(w[i]).toBeCloseTo(w[n - i]!, 6);
      }
    }
  });

  it('hann sums to N/2 (periodic form)', () => {
    const n = 128;
    expect(windowSum(makeWindow('hann', n))).toBeCloseTo(n / 2, 3);
  });

  it('all windows are bounded by [0, 1] except blackman touching ~0', () => {
    for (const name of WINDOW_NAMES) {
      const w = makeWindow(name, 128);
      for (const v of w) {
        expect(v).toBeGreaterThanOrEqual(-1e-6);
        expect(v).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });
});
