# Grocer

Grocery list + cheapest-supermarket finder for Israel. npm-workspaces monorepo:

- `apps/api` — Node 24.14+ (runs TypeScript natively) + TypeScript, Hono, Drizzle ORM on SQLite (better-sqlite3), better-auth.
- `apps/mobile` — Expo SDK 58 + expo-router app (iOS/Android).

## Run

```bash
nvm use                       # Node 24
npm install                   # installs both apps
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
npm run dev:api               # http://localhost:3000 (GET /health)
npm run dev:mobile            # Metro for the dev build (expo-dev-client); Expo Go is not supported
npm run typecheck && npm test # both apps
```

The app runs in a development build, not Expo Go. Build and install it once (and again after adding a native module):
`npm run ios -w apps/mobile` / `npm run android -w apps/mobile` locally (Xcode / Android Studio), or in the cloud with
`npx eas-cli@latest build --profile development` (`development-simulator` for the iOS simulator). Then `npm run dev:mobile` serves JS to it.

The API applies migrations from `apps/api/drizzle/` on startup. After changing the schema:
`npm run db:generate -w apps/api`.

On a physical device, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP, not localhost.

## Env vars

| App | Var | Notes |
| --- | --- | --- |
| api | `PORT` | default 3000 |
| api | `DATABASE_URL` | SQLite file path, default `./data/grocer.db` (`:memory:` in tests) |
| api | `BETTER_AUTH_URL` | public URL of the API (OAuth callbacks) |
| api | `BETTER_AUTH_SECRET` | 32+ random chars: `openssl rand -base64 32` |
| api | `TRUSTED_ORIGINS` | extra comma-separated origins (auth + CORS); set `http://localhost:8081` in dev for Expo web, never in production |
| api | `TRUST_PROXY` | `true` behind a reverse proxy: rate limits key by the last `X-Forwarded-For` hop; default `false` (socket address). The API port must then be reachable only through the proxy, or clients can spoof the header |
| api | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional; Google sign-in on when both set. The OAuth client must allow `<BETTER_AUTH_URL>/api/auth/callback/google` (the deletion page at `/account` signs in through it) |
| api | `SYNC_TIMES` | Scheduled sync times, comma-separated `HH:MM` in Asia/Jerusalem time, default `05:00,12:00,23:30` |
| api | `SYNC_TOKEN` | shared secret for the private trigger (`Authorization: Bearer <token>`); the private port starts only when set |
| api | `INTERNAL_PORT`, `INTERNAL_HOST` | private trigger address, default `127.0.0.1:3001`; never expose it publicly |
| api | `RESEND_API_KEY` | required; Resend API key for sending email (Reset codes and Deletion codes) |
| api | `EMAIL_FROM` | sender address, default `Grocer <no-reply@example.com>` |
| api | `NOMINATIM_URL` | optional geocoder base URL for `npm run geocode`, default `https://nominatim.openstreetmap.org` |
| api | `SENTRY_DSN` | optional; the one Sentry project `grocer`, shared with mobile (events tagged `app:api`). Unset: errors are only logged |
| api | `SENTRY_ENVIRONMENT` | default `development`; set `production` in deploys. Traces: 100% in development, 20% in production, the same rule as mobile (`packages/shared/src/sentry.ts`) |
| api | `LLM_API_KEY` | optional; key for the Product type classifier in the Price sync. Unset: the step is skipped (logged once per sync) and Products stay untyped. Product names are sent to the provider |
| api | `LLM_BASE_URL`, `LLM_MODEL` | any OpenAI-compatible Chat Completions API and model, default `https://api.openai.com/v1` and `gpt-4.1-mini` |
| api | `LLM_MAX_NAMES` | distinct Product names classified per Price sync, default 5000; the rest wait for the next sync |
| api | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | optional; Apple sign-in on when id + secret set |
| mobile | `EXPO_PUBLIC_API_URL` | e.g. `http://localhost:3000` |
| mobile | `EXPO_PUBLIC_SENTRY_DSN` | optional; same DSN as the API's `SENTRY_DSN` (events tagged `app:mobile`). Unset: the SDK stays off. `.env` is not uploaded to EAS, so set it as an EAS env var for cloud builds |
| mobile | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | build time only, for source map upload; set as EAS secrets, never in git |
| mobile | `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | optional; PostHog product analytics, identified by the better-auth user id; host default `https://eu.i.posthog.com` |

## Ingest

Prices come from the Israeli Price Transparency files (`docs/research/price-data.md`). In `apps/api`, per chain (keys in `src/ingest/chains.ts`):
`npm run fetch -- --chain rami-levy --out /tmp/prices/rami-levy` (newest Stores + PriceFull of `--max-stores N` stores, default 3; every chain except Hazi Hinam: Cerberus, Shufersal, Carrefour, laibcatalog for Victory and Machsanei Hashuk),
then `npm run ingest -- --chain rami-levy --stores /tmp/prices/rami-levy/Stores* --prices /tmp/prices/rami-levy/PriceFull*`,
then `npm run geocode -- --chain rami-levy` to fill store coordinates from Nominatim at 1 req/s. Stores without coordinates are left out of `/api/compare`.
Behind an HTTPS proxy, prefix `fetch`/`geocode` with `NODE_USE_ENV_PROXY=1`. The price portals and Nominatim may block non-Israeli or cloud IPs.
On Windows a whole chain's `--prices` list can pass cmd's 8191-character limit through `npm run`; run `node src/worker.ts ingest-prices ...` from the download folder with relative names instead.

### Price sync

A Price sync (`CONTEXT.md`, "Prices") does fetch, ingest and geocode for every chain and every store in one run, recorded in
`sync_runs` and `sync_chain_results`. A chain that fails keeps its previous prices; the others continue.

- `npm run sync -w apps/api [-- --max-stores N]`: run one Manual sync now and exit.
- `npm run worker -w apps/api`: the long-running worker, a second process next to the API on the same SQLite file. Once a
  minute it runs Scheduled syncs at `SYNC_TIMES` and any waiting Manual sync request. SIGTERM stops a sync after its current
  chain (recorded as interrupted).
- Manual sync from the internal dashboard: `curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" http://127.0.0.1:3001/sync`
  answers 202 `{ "id": n }` (recorded; the worker runs it within a minute), 409 while a sync is running or waiting, 401 without
  the token. A finished Manual sync skips the next Scheduled sync.

## Deploy

Each setting lives in one place: mobile app settings in EAS, server settings in Coolify, and only the Expo token in GitHub.

- The server is one production stack on a Coolify VPS, built from `docker-compose.yaml` (Docker Compose build pack) on every push to `main`.
- `deploy-mobile.yml` builds Android only (iOS is not set up yet) on the GitHub runner with `eas build --local`, so it uses no EAS cloud
  build quota: on `main`, profile `staging` (EAS environment `preview`, uploaded with `eas upload` for internal distribution);
  on a published GitHub release, `production` (EAS environment `production`, submitted to Google Play with `eas submit`).
  The built file is also kept as a workflow artifact. Run it by hand after changing EAS variables.

**GitHub** (repo or both environments): secrets `EXPO_TOKEN`, an expo.dev access token (a robot user), and `SENTRY_AUTH_TOKEN`
(the local build can't read EAS secret variables, and the Android build fails without it). Add required reviewers to `production`.

**EAS** (expo.dev > project > Environment variables; `preview` for staging, `production` for production):

| Name | Visibility | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | plaintext | required; that environment's public API URL |
| `EXPO_PUBLIC_SENTRY_DSN` | plaintext | optional; same DSN as the API's `SENTRY_DSN` |
| `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | plaintext | optional |
| `SENTRY_ORG`, `SENTRY_PROJECT` | plaintext | source map upload |
| `SENTRY_AUTH_TOKEN` | secret | source map upload on EAS cloud builds only; `deploy-mobile` reads the GitHub secret instead |

`EXPO_PUBLIC_*` values are compiled into the app, so they are never secret. From `apps/mobile`:
`npx eas-cli@latest env:set preview --name EXPO_PUBLIC_API_URL --value https://... --visibility plaintext`.

**Coolify** (a Docker Compose resource on this repo, branch `main`, compose file `/docker-compose.yaml`):
give the `api` service its domain as `https://api.example.com:3000` and set the API env vars listed above in the resource's
Environment Variables. Required: `BETTER_AUTH_URL` (that domain), `BETTER_AUTH_SECRET`, `RESEND_API_KEY` (the worker needs it too,
since config validation requires it). `SENTRY_ENVIRONMENT` defaults to `production`, `TRUST_PROXY` is always on, and `PORT` and
`DATABASE_URL` (`/data/grocer.db`) have image defaults. `api` and `worker` share the `grocer-data` volume (one SQLite file).

The chains' portals block non-Israeli IPs, so the worker's HTTP goes through the `tailscale` container, which uses a machine in Israel
as its Tailscale exit node. Price syncs fail while that machine is off or offline; prices stay at the last good sync. Set:

| Name | Notes |
| --- | --- |
| `TS_AUTHKEY` | Tailscale auth key for the container (admin console > Settings > Keys); used on first start, state lives in the `tailscale-state` volume |
| `TS_EXIT_NODE` | the Tailscale IP (`100.x.y.z`) of the machine in Israel; it runs Tailscale with "Run exit node" on, approved in the admin console |

To move an existing database in: stop the resource, copy the file into the `grocer-data` volume as `grocer.db`
(`/var/lib/docker/volumes/<volume>/_data/`), delete any `grocer.db-wal` and `grocer.db-shm` there (they belong to the old file and
would corrupt the new one), `chown 1000:1000` it (the containers run as `node`), and start the resource.
Make the copy with `VACUUM INTO` rather than copying the file, so the WAL is included and the copy is consistent.

One-time setup (the EAS project is `@ottersprod/grocer`): run one interactive
`eas build --profile production` per platform to create signing credentials; add an App Store Connect API key and a Google Play
service account key to EAS for submits (Google Play needs the first Android upload by hand); register iOS test devices for staging
builds with `eas device:create`.

## Known limitations / not verified on device

- Built and checked with typecheck, vitest and `expo export` only; nothing has run on a real device or simulator yet.
- Gesture feel (SwipeRow thresholds, velocity handoff, haptic timing) and the bottom sheet with the keyboard are unverified.
- Hebrew/RTL layouts are reasoned from `start`/`end` styles and `I18nManager.isRTL`, not seen on screen.
- A signed-out `grocer://join/<code>` link lands on onboarding and the code is lost after sign-in.
- Shared lists sync by 5 s polling (paused on hidden screens), not push.
- "Order online" only copies the list and opens the chain's site; no chain exposes add-to-cart links.
