#!/usr/bin/env sh
# Re-freeze the benchmark baselines under bench-baselines/. Mirror of the
# golden-vector `golden:bless` workflow: run only when a change intentionally
# moves the numbers, and review the diff as part of the PR.
#
#   pnpm bench:bless            # all engines
#   pnpm bench:bless ts         # just one (rust | ts | wasm)
#
# Rust and WASM need the toolchain (cargo, wasm-pack); `ts` needs neither.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
mkdir -p bench-baselines
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

engines="${*:-rust ts wasm}"

for engine in $engines; do
  case "$engine" in
    rust)
      echo "→ rust: cargo bench"
      cargo bench --bench engine
      node scripts/bench/collect-rust.ts target/criterion > bench-baselines/rust.json
      ;;
    ts)
      echo "→ ts: vitest bench"
      pnpm exec vitest bench --run --root . packages/dsp/bench --outputJson="$TMP/ts.json"
      node scripts/bench/collect-vitest.ts ts "$TMP/ts.json" > bench-baselines/ts.json
      ;;
    wasm)
      echo "→ wasm: build + vitest bench"
      pnpm --filter @sonoglyph/dsp-wasm build:wasm
      pnpm exec vitest bench --run --root . packages/dsp-wasm/bench --outputJson="$TMP/wasm.json"
      node scripts/bench/collect-vitest.ts wasm "$TMP/wasm.json" > bench-baselines/wasm.json
      ;;
    *)
      echo "unknown engine: $engine (expected rust | ts | wasm)" >&2
      exit 2
      ;;
  esac
  echo "  blessed bench-baselines/$engine.json"
done
