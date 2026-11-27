#!/usr/bin/env bash
# Build the claim program inside WSL from a native copy (fast disk).
set -euo pipefail
export PATH=$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH
SRC=${SRC:-/mnt/c/Users/zulab/tok}
DST=${DST:-$HOME/tok-build}
mkdir -p "$DST"
rsync -a --delete --exclude target --exclude node_modules --exclude .git --exclude android --exclude web "$SRC/" "$DST/"
cd "$DST"
FEATURES=${FEATURES:-}
if [ -n "$FEATURES" ]; then
  cargo build-sbf --manifest-path programs/tok-claim/Cargo.toml --features "$FEATURES" --sbf-out-dir target/deploy-$FEATURES
else
  cargo build-sbf --manifest-path programs/tok-claim/Cargo.toml --sbf-out-dir target/deploy
fi
mkdir -p "$SRC/target/deploy"
cp target/deploy*/*.so "$SRC/target/deploy/" 2>/dev/null || true
ls -la "$SRC/target/deploy"
