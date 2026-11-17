# syntax=docker/dockerfile:1

FROM node:24.22.3-slim AS base
# Matches packageManager in package.json.
RUN npm install --global pnpm@12.18.0
WORKDIR /app
# Manifests first, so a source edit does not reinstall dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/protocol/package.json packages/protocol/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter web...
COPY . .
RUN pnpm build

# Only what the server needs at run time. Node runs its TypeScript directly.
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --filter @teleprompter/server...

FROM node:24.22.3-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4747 \
    TELEPROMPTER_DATA_DIR=/data \
    TELEPROMPTER_WHISPER_URL=http://host.docker.internal:2022
WORKDIR /app
COPY --from=deps /app ./
COPY apps/server/src apps/server/src
COPY packages/protocol/src packages/protocol/src
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4747
HEALTHCHECK CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/script`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/server/src/main.ts"]
