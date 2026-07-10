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
import { renderSection, toBenchSet, type GateResult } from './lib.ts';

const MARKER = '<!-- sonoglyph-bench-report -->';
const ENGINES = ['rust', 'ts', 'wasm'];

const resultDir = process.argv[2] ?? 'bench-results';
const present = new Set(
  readdirSync(resultDir)
    .map((f) => /^bench-result-(.+)\.json$/.exec(f)?.[1])
    .filter((e): e is string => e !== undefined),
);

const sections: string[] = [];
const blessBlocks: string[] = [];
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
  blessBlocks.push(
    `**\`bench-baselines/${engine}.json\`**\n\n\`\`\`json\n${JSON.stringify(
      toBenchSet(result),
      null,
      2,
    )}\n\`\`\``,
  );
}

// Performance baselines are hardware-specific: the committed numbers must come
// from a CI run, not a local `pnpm bench:bless`. Embedding the exact measured
// values makes re-blessing (or bootstrapping) a copy-paste from this comment.
const blessDetails = blessBlocks.length
  ? [
      '<details><summary>📋 CI-measured values — copy into <code>bench-baselines/</code> to re-bless</summary>',
      '',
      ...blessBlocks,
      '</details>',
    ]
  : [];

const verdict = anyRegression
  ? '🔴 **Performance regression detected.** Speed it back up — or, if the change is intended, re-bless by copying the CI-measured values below into `bench-baselines/`, or add the **`tolerable regression`** label to override this gate.'
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
  ...blessDetails,
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
