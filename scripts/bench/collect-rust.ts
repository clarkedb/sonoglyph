/**
 * Normalise a criterion output tree into the shared bench-set format.
 *
 *   node scripts/bench/collect-rust.ts <target/criterion dir> > current.json
 *
 * Criterion writes `<criterion>/<group>/<id>/.../new/estimates.json` (with
 * `/`-containing group and benchmark names becoming nested directories), so the
 * benchmark name is just the path from the criterion root to the directory
 * holding `new/`, joined with `/`. That reproduces the same keys the source
 * used — `fft/magnitudes/radix2/512`, `engine/push-1s/rustfft`,
 * `goertzel/power-2048` — matching the TS suite's group/bench keys where they
 * overlap. The metric is `median.point_estimate` (ns).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { BenchSet } from './lib.ts';

const [criterionDir] = process.argv.slice(2);
if (!criterionDir) {
  console.error('usage: collect-rust.ts <target/criterion dir>');
  process.exit(2);
}

interface Estimates {
  median: { point_estimate: number };
}

const benchmarks: Record<string, number> = {};

/** Recursively find every `new/estimates.json`, skipping criterion's HTML `report` dirs. */
function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'report') continue;
    const child = join(dir, entry.name);
    if (entry.name === 'new') {
      const estimates = JSON.parse(
        readFileSync(join(child, 'estimates.json'), 'utf8'),
      ) as Estimates;
      // The benchmark name is the path to the dir that contains `new/`.
      const name = relative(criterionDir, dir).split(/[\\/]/).join('/');
      benchmarks[name] = estimates.median.point_estimate;
      continue;
    }
    walk(child);
  }
}

walk(criterionDir);

const set: BenchSet = { engine: 'rust', metric: 'median', unit: 'ns', benchmarks };
process.stdout.write(`${JSON.stringify(set, null, 2)}\n`);
