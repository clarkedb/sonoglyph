/**
 * Cross-validation harness for the golden vectors: asserts the reference
 * implementation still matches the frozen `golden.json` within `TOLERANCE`.
 * Re-freeze intentional changes with `pnpm --filter @sonoglyph/dsp golden:bless`
 * (see `../../scripts/bless-golden.ts`); both paths run through the same
 * `computeGolden`, so they cannot drift.
 *
 * When the Rust/WASM engine lands (issue #16) its harness reads this same
 * `golden.json` and applies the same tolerance.
 */

import { describe, expect, it } from 'vitest';
import { computeGolden, GOLDEN_VECTORS, TOLERANCE, type FrozenResult } from './vectors.ts';
import goldenJson from './golden.json';

const frozen = goldenJson as unknown as Record<string, FrozenResult>;

/** Recursively assert `actual` matches `expected`: numbers within TOLERANCE,
 *  everything else exactly. `path` is threaded only to make failures legible. */
function expectClose(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === 'number') {
    expect(typeof actual, `${path}: type`).toBe('number');
    expect(
      Math.abs((actual as number) - expected),
      `${path}: |Δ| within ${TOLERANCE}`,
    ).toBeLessThanOrEqual(TOLERANCE);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path}: array`).toBe(true);
    expect((actual as unknown[]).length, `${path}: length`).toBe(expected.length);
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e, `${path}[${i}]`));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', `${path}: object`).toBe(true);
    for (const key of Object.keys(expected)) {
      expectClose(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
    return;
  }
  expect(actual, `${path}: exact`).toBe(expected);
}

describe('golden vectors', () => {
  it('freezes every vector under a unique name', () => {
    expect(new Set(GOLDEN_VECTORS.map((v) => v.name)).size).toBe(GOLDEN_VECTORS.length);
  });

  for (const vector of GOLDEN_VECTORS) {
    it(vector.name, () => {
      const expected = frozen[vector.name];
      expect(expected, `no frozen value for ${vector.name} — run golden:bless`).toBeDefined();
      expectClose(computeGolden(vector), expected, vector.name);
    });
  }
});
