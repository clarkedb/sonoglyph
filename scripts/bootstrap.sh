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
echo "✓ ready — try 'pnpm dev' or 'pnpm test'"
