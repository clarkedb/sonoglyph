/**
 * Compare one engine's fresh run against its committed baseline and write the
 * per-engine result the report step aggregates.
 *
 *   node scripts/bench/gate.ts <engine> <current.json> [result-dir]
 *
 * Always exits 0 (a regression is a gate decision the report step makes across
 * all engines, honouring the `tolerable regression` label). Prints the section
 * to stdout for the job log.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compareSets, readJson, renderSection, threshold, type BenchSet } from './lib.ts';

const [engine, currentPath, resultDir = 'bench-results'] = process.argv.slice(2);
if (!engine || !currentPath) {
  console.error('usage: gate.ts <engine> <current.json> [result-dir]');
  process.exit(2);
}

const baselinePath = fileURLToPath(
  new URL(`../../bench-baselines/${engine}.json`, import.meta.url),
);
const baseline = readJson<BenchSet>(baselinePath);
const current = readJson<BenchSet>(currentPath);

const result = compareSets(baseline, current, threshold());

mkdirSync(resultDir, { recursive: true });
writeFileSync(
  join(resultDir, `bench-result-${engine}.json`),
  `${JSON.stringify(result, null, 2)}\n`,
);

process.stdout.write(`${renderSection(result)}\n`);
if (result.hasRegression) {
  console.error(`✗ ${engine}: regression beyond ${result.thresholdPct}% threshold`);
}
