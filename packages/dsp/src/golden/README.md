# Golden vectors

Frozen reference outputs of the TypeScript DSP, kept so a future Rust/WASM
port ([issue #16](https://github.com/clarkedb/sonoglyph/issues/16)) can be
cross-validated against the identical fixtures — "the strongest correctness
story DSP code can have" ([architecture.md](../../../../docs/architecture.md)).

## What is and isn't stored

The repo rule holds (see [`generate.ts`](../generate.ts)): **inputs are
generated in code, never stored.** Each vector in [`vectors.ts`](./vectors.ts)
describes its input with a `makeInput()` built from the standard synthesis
helpers; only the _expected output_ is frozen, in
[`golden.json`](./golden.json). That JSON is the language-agnostic contract.

Two surfaces are covered, matching the two the Rust port must expose:

- **The streaming engine** (`TsDspEngine`) — one representative analysis frame
  per stream (`spectrum` magnitudes, `peaks`, `envelope`). Framing/timing is
  covered by [`engine.test.ts`](../engine.test.ts); these pin the DSP math.
- **The standalone primitives** — `goertzelMagnitude` / `goertzelPower`, which
  plugins call directly on a `samples` frame and are _not_ part of the
  `DspEngine` contract. Vectors probe on-bin, off-grid, absent, DC, and
  Nyquist frequencies — including the documented 2× overstatement at DC and
  Nyquist (frozen exactly, so the port must reproduce the quirk).

## Workflow

```sh
pnpm test                              # verify: assert the engine still matches golden.json
pnpm --filter @sonoglyph/dsp golden:bless   # re-freeze after an intentional change
```

Verify ([`golden.test.ts`](./golden.test.ts)) and bless
([`../../scripts/bless-golden.ts`](../../scripts/bless-golden.ts)) both run
through the same `computeGolden` in [`vectors.ts`](./vectors.ts), so the frozen
file and the asserted values cannot drift. Re-bless **only** when a numeric
change is intended — review the `golden.json` diff as part of the PR; an
unexpected diff is a regression, not a rebless.

## The tolerance is the contract

Comparison uses an absolute tolerance of `1e-5` (`TOLERANCE` in `vectors.ts`),
looser than the 6-digit rounding used when freezing. This is deliberate: it is
the margin the Rust engine's `f64` pipeline must land within to be considered
equivalent to the TS reference. When the WASM engine arrives, its harness
reads this same `golden.json` and applies the same tolerance.
