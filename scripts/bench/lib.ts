/**
 * Shared plumbing for the DSP benchmark gate. A "bench set" is a flat map of
 * benchmark name → representative time (the median), in whatever unit the
 * source produces (criterion emits ns, vitest emits ms). The gate is purely
 * ratio-based, so units never need to match across engines — only within one.
 *
 * The gate mirrors the golden-vector workflow: a committed baseline
 * (`bench-baselines/<engine>.json`) that a human re-blesses when a change
 * intentionally moves the numbers. See `.github/workflows/bench.yml`.
 */

import { readFileSync } from 'node:fs';

export interface BenchSet {
  /** Engine identifier: `rust` | `ts` | `wasm`. */
  engine: string;
  /** Which statistic `benchmarks` holds — always `median` today. */
  metric: string;
  /** Unit of the values, for display only (`ns` | `ms`). */
  unit: string;
  /** Benchmark name → representative time. Lower is faster. */
  benchmarks: Record<string, number>;
}

export type RowStatus = 'ok' | 'regression' | 'improvement' | 'new' | 'removed';

export interface Row {
  name: string;
  baseline: number | null;
  current: number | null;
  /** Percent change vs. baseline; positive = slower. Null for new/removed. */
  pctChange: number | null;
  status: RowStatus;
}

export interface GateResult {
  engine: string;
  unit: string;
  thresholdPct: number;
  hasRegression: boolean;
  rows: Row[];
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** The regression threshold (percent slower), overridable for tuning. */
export function threshold(): number {
  const raw = process.env.BENCH_THRESHOLD;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 15;
}

/**
 * Compare a fresh run against its baseline. A benchmark regresses when it is
 * more than `thresholdPct` slower. Benchmarks present in only one set are
 * surfaced (`new`/`removed`) but never fail the gate — adding or renaming a
 * benchmark is a bless-worthy change, not a regression.
 */
export function compareSets(
  baseline: BenchSet,
  current: BenchSet,
  thresholdPct: number,
): GateResult {
  const names = [
    ...new Set([...Object.keys(baseline.benchmarks), ...Object.keys(current.benchmarks)]),
  ].sort();

  const rows: Row[] = names.map((name) => {
    const base = baseline.benchmarks[name] ?? null;
    const cur = current.benchmarks[name] ?? null;
    if (base === null)
      return { name, baseline: null, current: cur, pctChange: null, status: 'new' };
    if (cur === null)
      return { name, baseline: base, current: null, pctChange: null, status: 'removed' };
    const pctChange = ((cur - base) / base) * 100;
    const status: RowStatus =
      pctChange > thresholdPct ? 'regression' : pctChange < -thresholdPct ? 'improvement' : 'ok';
    return { name, baseline: base, current: cur, pctChange, status };
  });

  return {
    engine: current.engine,
    unit: current.unit,
    thresholdPct,
    hasRegression: rows.some((r) => r.status === 'regression'),
    rows,
  };
}

const ICON: Record<RowStatus, string> = {
  ok: '✅',
  regression: '🔴',
  improvement: '🟢',
  new: '🆕',
  removed: '⚠️',
};

function fmt(value: number | null, unit: string): string {
  if (value === null) return '—';
  // Enough significant figures to be useful across ns (large) and ms (tiny).
  const shown =
    value >= 100 ? value.toFixed(1) : value >= 1 ? value.toFixed(3) : value.toPrecision(3);
  return `${shown} ${unit}`;
}

function fmtDelta(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/** Render one engine's result as a Markdown section (used in the PR comment). */
export function renderSection(result: GateResult): string {
  const { engine, unit, rows } = result;
  const verdict = result.hasRegression ? '🔴 regression' : '✅ within threshold';
  const header = `### ${engine} — ${verdict}\n`;
  const table = [
    `| Benchmark | Baseline | Current | Δ | |`,
    `| --- | ---: | ---: | ---: | :---: |`,
    ...rows.map(
      (r) =>
        `| \`${r.name}\` | ${fmt(r.baseline, unit)} | ${fmt(r.current, unit)} | ${fmtDelta(
          r.pctChange,
        )} | ${ICON[r.status]} |`,
    ),
  ].join('\n');
  return `${header}\n${table}\n`;
}
