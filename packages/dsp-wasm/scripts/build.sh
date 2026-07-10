#!/usr/bin/env sh
# Wired into the workspace's `pnpm build` (via the `build` script in
# package.json) so a real build picks up the WASM engine automatically
# wherever cargo + wasm-pack happen to be available -- no separate manual
# step, no platform-specific config. Rust stays optional for TS-only work:
# without the toolchain this skips gracefully instead of failing the build,
# and the playground falls back to its stub (apps/playground/src/wasm-stub.ts).
set -e

if command -v cargo >/dev/null 2>&1 && command -v wasm-pack >/dev/null 2>&1; then
  pnpm run build:wasm
else
  echo "ℹ cargo/wasm-pack not found -- skipping @sonoglyph/dsp-wasm; the WASM engine falls back to the stub. Install rustup (https://rustup.rs) + wasm-pack to include it."
fi
