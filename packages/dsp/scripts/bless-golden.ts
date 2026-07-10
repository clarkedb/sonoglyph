/**
 * Re-freeze the golden vectors: run every vector through the current
 * reference implementation and write the digests to `golden.json`.
 *
 *   pnpm --filter @sonoglyph/dsp golden:bless
 *
 * Run only when a numeric change to the DSP is intended; review the
 * `golden.json` diff as part of the PR. Verification lives in
 * `../src/golden/golden.test.ts` — both share `computeGolden`, so the frozen
 * file and the asserted values cannot drift. Lives outside `src/` because it
 * uses Node APIs; the DSP package's `src/` is browser-safe by design.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeGolden, GOLDEN_VECTORS, type FrozenResult } from '../src/golden/vectors.ts';

const outPath = fileURLToPath(new URL('../src/golden/golden.json', import.meta.url));
const frozen: Record<string, FrozenResult> = {};
for (const vector of GOLDEN_VECTORS) {
  frozen[vector.name] = computeGolden(vector);
}
writeFileSync(outPath, `${JSON.stringify(frozen, null, 2)}\n`);
console.log(`froze ${GOLDEN_VECTORS.length} golden vectors → ${outPath}`);
