FROM ghcr.io/solana-foundation/kora:v3.0.0@sha256:8bd1e7ad3ad8d3cc60db6c11e13597d0cfda6351d40a6324b9d80ee85433ee87 AS kora

FROM node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
COPY --from=kora /usr/local/bin/kora /usr/local/bin/kora
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --filter @tok/server... --prod=false
COPY packages/core packages/core
COPY server server
COPY deploy deploy
RUN chmod +x deploy/start.sh
ENV NODE_ENV=production KORA_URL=http://127.0.0.1:8080
CMD ["/app/deploy/start.sh"]
