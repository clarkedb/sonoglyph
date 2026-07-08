---
name: review-pr
description: Multi-agent PR review — 2-4 parallel subagent reviewers with distinct lenses, findings organized critical/warning/info/nit, then a verified judge pass that presents only what holds up, with a recommendation.
---

# Multi-agent PR review

Review a PR (or the current branch vs `main`) with parallel subagent
reviewers, then judge their findings before presenting. The judge pass is
the point: raw reviewer output always contains plausible-but-wrong claims,
so nothing reaches the final report unverified.

## 1. Scope

Establish the diff: `gh pr view <n>` / `git log --oneline main..HEAD` /
`git diff main...HEAD --stat`. Note which areas it touches.

## 2. Pick 2–4 lenses

Choose by what the diff touches, so reviewers don't quadruple the same
findings. Menu (adapt freely):

- **DSP / numerical correctness** — math, boundary/off-by-one, state
  machines, numerical robustness, vacuous test assertions
  (`packages/dsp`, `plugins/*`)
- **Architecture / contracts / docs** — layering rules, `core` interface
  coherence, doc claims vs code, API footguns for plugin authors
- **Browser / playground** — resource lifecycles (mic/AudioContext/worklet),
  races, hostile-input handling (WAV), React/rAF correctness, a11y
- **Tooling / tests / CI** — workflow hardening, hook gaps, publishability,
  coverage holes, config that silently excludes things

Fewer, deeper reviewers beat many shallow ones; 4 is the ceiling.

## 3. Spawn reviewers in parallel

Launch all reviewers concurrently as subagents (use your environment's
parallel subagent mechanism). Each prompt should contain:

- Repo path, how to orient (`git log`/`git diff` commands), and that the
  review is **read-only** — no file modifications, no installs
- The lens, with the specific files/concerns it owns
- An instruction to be skeptical and construct concrete failure inputs
- The required output format: findings under headings
  `CRITICAL / WARNING / INFO / NIT`, each finding as
  `file:line — one-sentence defect — concrete failure scenario`;
  "none" for empty categories; no style issues the formatter/linter
  already enforces; final message is only the structured findings

## 4. Judge (this is your job, not another subagent's)

For every CRITICAL and WARNING claim: **verify it against the code**
before believing it — read the cited lines, re-derive the control flow,
check the claimed doc text exists. Then:

- Dedupe across reviewers; merge findings sharing a root cause
- Re-rank severity by _your_ judgment (reviewers over- and under-shoot)
- Explicitly dismiss or downgrade what didn't hold up — speculative,
  already-documented-as-deliberate, or wrong — and say why
- Keep a "dismissed/downgraded" section; silent drops hide judge errors

## 5. Present

One report, most severe first: CRITICAL / WARNING / INFO / NIT, each
finding with its verification status and concrete failure scenario. End
with a recommendation that splits into:

1. **Fix before merge** — bugs and cheap hardening on this branch
2. **File as issues** — real findings that don't block the PR (batch
   related ones; fold into existing issues where one fits)
3. Anything dismissed, with reasons

Do not apply fixes unless asked — the report is the deliverable.
