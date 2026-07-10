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

## Re-blessing

Regenerate after an **intentional** performance change and review the diff as
part of the PR:

```sh
pnpm bench:bless          # all three engines (needs the Rust toolchain + wasm-pack)
pnpm bench:bless ts       # just one: rust | ts | wasm
```

For a reviewed slowdown not worth re-blessing, label the PR
`tolerable regression` to override the gate for that PR only.

These numbers are machine-dependent; the committed values come from CI-class
hardware. What the gate enforces is the _ratio_ to baseline, not absolute time.
