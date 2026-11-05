# Internal dashboard image. Build from the repo root: docker build -f apps/dashboard/Dockerfile -t grocer-dashboard .
# It holds no data: it only calls the api's private app (API_URL, SYNC_TOKEN).
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
# npm also installs the other workspaces' packages; none of the dashboard's needs an install script, so no native build runs.
RUN npm ci -w apps/dashboard --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app ./
COPY packages/shared/src packages/shared/src
COPY apps/dashboard/src apps/dashboard/src
USER node
WORKDIR /app/apps/dashboard
EXPOSE 3002
CMD ["node", "src/dashboard.ts"]
