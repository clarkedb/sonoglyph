/**
 * Normalise `vitest bench --outputJson` into the shared bench-set format.
 *
 *   node scripts/bench/collect-vitest.ts <engine> <vitest-output.json> > current.json
 *
 * Benchmark names are `<group>/<bench>` (e.g. `fft/magnitudes/512`), where the
 * group is the vitest group name with the `<file> > ` prefix stripped, so the
 * keys line up with the criterion suite's group/id paths. The metric is the
 * median (ms) — the same statistic the Rust side reads from criterion.
 */

import { readFileSync } from 'node:fs';
import type { BenchSet } from './lib.ts';

interface VitestBench {
  name: string;
  median: number;
}
interface VitestGroup {
  fullName: string;
  benchmarks: VitestBench[];
}
interface VitestOutput {
  files: Array<{ groups: VitestGroup[] }>;
}

const [engine, inputPath] = process.argv.slice(2);
if (!engine || !inputPath) {
  console.error('usage: collect-vitest.ts <engine> <vitest-output.json>');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as VitestOutput;

const benchmarks: Record<string, number> = {};
for (const file of raw.files) {
  for (const group of file.groups) {
    // fullName is "<filepath> > <group>[ > <subgroup>…]"; drop the file prefix
    // and join any nested describe levels with `/` to match the criterion keys.
    const groupName = (
      group.fullName.includes(' > ')
        ? group.fullName.slice(group.fullName.indexOf(' > ') + 3)
        : group.fullName
    ).replaceAll(' > ', '/');
    for (const b of group.benchmarks) {
      benchmarks[`${groupName}/${b.name}`] = b.median;
    }
  }
}

const set: BenchSet = { engine, metric: 'median', unit: 'ms', benchmarks };
process.stdout.write(`${JSON.stringify(set, null, 2)}\n`);
