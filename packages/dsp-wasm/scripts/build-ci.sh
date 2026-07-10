#!/usr/bin/env sh
# Used by the root `build:ci` script for deploy environments that don't
# provision the Rust toolchain themselves (e.g. a hosting platform's default
# Node build image). Installs rustup + wasm-pack when missing via their
# official installers, then always builds -- unlike `build` (scripts/build.sh),
# which skips gracefully so a plain local/CI `pnpm build` stays fast without
# Rust. This fails loudly on a real build error rather than masking it as
# "skipped", and works the same on any platform: nothing here is
# hosting-platform-specific.
set -e

if ! command -v cargo >/dev/null 2>&1; then
  echo "→ cargo not found -- installing rustup (toolchain pinned by rust-toolchain.toml)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "→ wasm-pack not found -- installing"
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

pnpm run build:wasm
