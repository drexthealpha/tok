#!/usr/bin/env bash
# Run the chain tests on Linux (LiteSVM has no Windows build).
set -euo pipefail
SRC=${SRC:-/mnt/c/Users/zulab/tok}
DST=${DST:-$HOME/tok-test}
mkdir -p "$DST"
rsync -a --delete --exclude node_modules --exclude .git --exclude android --exclude 'target/release' --exclude 'target/sbpf*' "$SRC/" "$DST/"
cd "$DST"
command -v pnpm >/dev/null || npm i -g pnpm@10.33.2 >/dev/null
pnpm install --frozen-lockfile=false --prefer-offline >/dev/null
npx vitest run "${@:-tests}"
