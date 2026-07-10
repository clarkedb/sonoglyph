# DSP benchmark baselines

Committed known-good timings for the DSP engines. The performance gate
(`.github/workflows/bench.yml`) benchmarks each engine on every DSP PR and
fails when any benchmark runs **more than 15% slower** than the snapshot here —
the same "committed artifact, re-blessed by a script" pattern as the golden DSP
vectors (`packages/dsp/src/golden`).

- `rust.json` — the criterion suite (`crates/sonoglyph-dsp/benches/engine.rs`), medians in **ns**.
- `ts.json` — the TypeScript reference (`packages/dsp/bench/`), medians in **ms**.
- `wasm.json` — the wasm-pack build (`packages/dsp-wasm/bench/`), medians in **ms**.

Units differ per engine because the gate is purely ratio-based (baseline vs.
current, same engine) — they never need to match across engines.

## These numbers are CI-measured, not local

The gate enforces the _ratio_ of a fresh run to the committed baseline, so the
baseline must reflect the **CI runner's** hardware — a local machine can easily
be 2–3× faster or slower, which would swamp any real regression. So the
committed values come from a CI run, **not** from a local `pnpm bench:bless`.

## Re-blessing

After an **intentional** performance change (or when adding/removing a
benchmark), update the baseline from a CI run and review the diff in the PR:

1. Push the change. The **DSP benchmark gate** comment on the PR includes a
   collapsed _"CI-measured values"_ section with the exact JSON for each engine.
2. Copy each block into the matching `bench-baselines/<engine>.json` and commit.

`pnpm bench:bless [rust|ts|wasm]` regenerates the same files from a **local**
run (needs the Rust toolchain + wasm-pack). Use it to sanity-check the format or
to add/remove benchmark _keys_ — but don't commit its numbers as the baseline
unless you're running on CI-class hardware, or the gate will misfire.

For a reviewed slowdown not worth re-blessing, label the PR
`tolerable regression` to override the gate for that PR only.
