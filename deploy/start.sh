#!/bin/sh
# Start Kora (internal, port 8080) and Tok's server (public, $PORT).
set -e
kora --config /app/deploy/kora.toml --rpc-url "${RPC_URL:-https://api.devnet.solana.com}" rpc start --signers-config /app/deploy/signers.toml &
KORA=$!
trap 'kill $KORA 2>/dev/null' EXIT INT TERM
cd /app/server && exec node --import tsx src/main.ts
