#!/usr/bin/env sh
# Bootstrap a fresh clone or worktree: verify the toolchain, install deps
# (which also installs the husky git hooks via the `prepare` script).
set -e
cd "$(dirname "$0")/.."

want="$(tr -d '[:space:]' <.nvmrc)"
have="$(node --version 2>/dev/null | sed 's/^v//')" || have=""
if [ "$have" != "$want" ]; then
  echo "⚠ Node $want expected (.nvmrc), found ${have:-none} — run 'nvm install' (or your version manager's equivalent) first." >&2
  exit 1
fi

pnpm install --frozen-lockfile

# Rust is optional: it powers the WASM DSP engine (crates/), but the TS engine
# is the permanent reference and everything TS-only works without it. Warn and
# continue rather than fail, so plugin authors never need a Rust toolchain.
if command -v rustup >/dev/null 2>&1; then
  echo "✓ rustup found — 'cargo test' provisions the toolchain from rust-toolchain.toml"
else
  echo "ℹ Rust not found. TS-only development is fully supported. To work on the"
  echo "  WASM engine (crates/), install rustup: https://rustup.rs"
fi

echo "✓ ready — try 'pnpm dev' or 'pnpm test'"
