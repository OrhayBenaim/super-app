# API and worker images. Build from the repo root:
#   docker build -f apps/api/Dockerfile --target api -t grocer-api .
#   docker build -f apps/api/Dockerfile --target worker -t grocer-worker .
# Both open the same SQLite file: run them on one host with the same volume on /data.
FROM node:24-slim AS deps
WORKDIR /app
# better-sqlite3 compiles from source when no prebuilt binary matches the platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w apps/api --omit=dev --no-audit --no-fund

FROM node:24-slim AS base
ENV NODE_ENV=production DATABASE_URL=/data/grocer.db
WORKDIR /app
COPY --from=deps /app ./
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
WORKDIR /app/apps/api

# Scheduled syncs (SYNC_TIMES) and Manual sync requests. On SIGTERM it finishes the current Chain first,
# so give it a long stop timeout (docker stop -t 600, compose stop_grace_period).
FROM base AS worker
CMD ["node", "src/worker.ts", "sync-worker"]

FROM base AS api
EXPOSE 3000
CMD ["node", "src/api.ts"]
