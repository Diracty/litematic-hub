FROM node:22-bookworm AS builder

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json tsconfig.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

ENV PORT=5173
ENV BASE_PATH=/

RUN pnpm --filter @workspace/litematic-hub run build
RUN pnpm --filter @workspace/api-server run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/public
ENV NODE_OPTIONS="--max-old-space-size=1792"
ENV MAX_LITEMATIC_UPLOAD_MB=100

COPY --from=builder /app/artifacts/api-server/dist /app/api-server/dist
COPY --from=builder /app/artifacts/litematic-hub/dist/public /app/public

EXPOSE 8080

CMD ["node", "--enable-source-maps", "/app/api-server/dist/index.mjs"]
