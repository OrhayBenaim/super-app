# Grocer

Grocery list + cheapest-supermarket finder for Israel. npm-workspaces monorepo:

- `apps/api` — Node 22 + TypeScript, Hono, Drizzle ORM on SQLite (better-sqlite3), better-auth.
- `apps/mobile` — Expo SDK 58 + expo-router app (iOS/Android).

## Run

```bash
nvm use                       # Node 22
npm install                   # installs both apps
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
npm run dev:api               # http://localhost:3000 (GET /health)
npm run dev:mobile            # Expo dev server; press i / a, or scan with a dev build
npm run typecheck && npm test # both apps
```

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
| api | `TRUSTED_ORIGINS` | extra comma-separated origins (auth + CORS) |
| api | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional; Google sign-in on when both set |
| api | `NOMINATIM_URL` | optional geocoder base URL for `npm run geocode`, default `https://nominatim.openstreetmap.org` |
| api | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | optional; Apple sign-in on when id + secret set |
| mobile | `EXPO_PUBLIC_API_URL` | e.g. `http://localhost:3000` |

## Ingest

Prices come from the Israeli Price Transparency files (`docs/research/price-data.md`). Download a chain's Stores and
PriceFull files (gz, zip or plain XML; the portals block non-Israeli IPs), then, in `apps/api`:
`npm run ingest -- --chain osher-ad --stores Stores*.xml --prices PriceFull*.gz` (chain keys: `src/ingest/chains.ts`)
and `npm run geocode` to fill store coordinates from Nominatim at 1 req/s. Stores without coordinates are left out of `/api/compare`.
