/**
 * Aggregate the per-engine gate results into one PR comment body and decide
 * the overall gate outcome.
 *
 *   node scripts/bench/report.ts [result-dir]
 *
 * Writes `bench-report.md` (the comment body, marked so the workflow can find
 * and update it), appends the same to `$GITHUB_STEP_SUMMARY`, and sets the
 * `regression` output on `$GITHUB_OUTPUT`. Always exits 0 — the workflow maps
 * `regression` + the `tolerable regression` label onto pass/fail, so a missing
 * engine result (a crashed bench job) still surfaces in the comment.
 */

import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSection, type GateResult } from './lib.ts';

const MARKER = '<!-- sonoglyph-bench-report -->';
const ENGINES = ['rust', 'ts', 'wasm'];

const resultDir = process.argv[2] ?? 'bench-results';
const present = new Set(
  readdirSync(resultDir)
    .map((f) => /^bench-result-(.+)\.json$/.exec(f)?.[1])
    .filter((e): e is string => e !== undefined),
);

const sections: string[] = [];
let anyRegression = false;
let anyMissing = false;

for (const engine of ENGINES) {
  if (!present.has(engine)) {
    sections.push(`### ${engine} — ⚠️ no results (bench job failed or was skipped)\n`);
    anyMissing = true;
    continue;
  }
  const result = JSON.parse(
    readFileSync(join(resultDir, `bench-result-${engine}.json`), 'utf8'),
  ) as GateResult;
  if (result.hasRegression) anyRegression = true;
  sections.push(renderSection(result));
}

const verdict = anyRegression
  ? '🔴 **Performance regression detected.** Speed it back up, or re-bless the baseline (`pnpm bench:bless`) if the change is intended — or add the **`tolerable regression`** label to override this gate.'
  : anyMissing
    ? '⚠️ **Incomplete** — at least one engine produced no results.'
    : '✅ **No regressions** beyond threshold.';

const body = [
  MARKER,
  '## DSP benchmark gate',
  '',
  verdict,
  '',
  ...sections,
  '',
  '<sub>🔴 regression · 🟢 improvement (re-bless to lock in) · 🆕 new · ⚠️ removed · Δ = % vs baseline, positive = slower</sub>',
].join('\n');

writeFileSync('bench-report.md', `${body}\n`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`);
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `regression=${anyRegression || anyMissing}\n`);
}

process.stdout.write(`${body}\n`);
