# Grocer

Grocery list + cheapest-supermarket finder for Israel. npm-workspaces monorepo:

- `apps/api` — Node 22.18+ (runs TypeScript natively) + TypeScript, Hono, Drizzle ORM on SQLite (better-sqlite3), better-auth.
- `apps/mobile` — Expo SDK 58 + expo-router app (iOS/Android).

## Run

```bash
nvm use                       # Node 22
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
| api | `TRUSTED_ORIGINS` | extra comma-separated origins (auth + CORS) |
| api | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional; Google sign-in on when both set |
| api | `NOMINATIM_URL` | optional geocoder base URL for `npm run geocode`, default `https://nominatim.openstreetmap.org` |
| api | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | optional; Apple sign-in on when id + secret set |
| mobile | `EXPO_PUBLIC_API_URL` | e.g. `http://localhost:3000` |

## Ingest

Prices come from the Israeli Price Transparency files (`docs/research/price-data.md`). In `apps/api`, per chain (keys in `src/ingest/chains.ts`):
`npm run fetch -- --chain rami-levy --out /tmp/prices/rami-levy` (newest Stores + PriceFull of `--max-stores N` stores, default 3; Cerberus chains and Shufersal),
then `npm run ingest -- --chain rami-levy --stores /tmp/prices/rami-levy/Stores* --prices /tmp/prices/rami-levy/PriceFull*`,
then `npm run geocode -- --chain rami-levy` to fill store coordinates from Nominatim at 1 req/s. Stores without coordinates are left out of `/api/compare`.
Behind an HTTPS proxy, prefix `fetch`/`geocode` with `NODE_USE_ENV_PROXY=1`. The price portals and Nominatim may block non-Israeli or cloud IPs.

## Known limitations / not verified on device

- Built and checked with typecheck, vitest and `expo export` only; nothing has run on a real device or simulator yet.
- Gesture feel (SwipeRow thresholds, velocity handoff, haptic timing) and the bottom sheet with the keyboard are unverified.
- Hebrew/RTL layouts are reasoned from `start`/`end` styles and `I18nManager.isRTL`, not seen on screen.
- A signed-out `grocer://join/<code>` link lands on onboarding and the code is lost after sign-in.
- Shared lists sync by 5 s polling (paused on hidden screens), not push.
- "Order online" only copies the list and opens the chain's site; no chain exposes add-to-cart links.
