# AGENTS.md

Grocer: a grocery list and cheapest-supermarket finder for Israel. Users keep a shopping list, and the app
compares what the list costs at nearby supermarkets. This file is for AI agents and humans working in the repo.

## Repo layout

```
apps/api/                 Node 24.14+ running TypeScript natively (strict, ESM, no build). Structure: apps/api/ARCHITECTURE.md
  src/api.ts              entry point: loadConfig() -> buildDeps() -> serve createApp(deps) (PORT, default 3000),
                          and createInternalApp(deps) on INTERNAL_HOST:INTERNAL_PORT when SYNC_TOKEN is set
  src/internal-app.ts     private trigger app: POST /sync records a Manual sync request (never on the public port)
  src/worker.ts           entry point: runs one job from src/jobs/ by name (npm run fetch|ingest|geocode|sync|worker)
  src/app.ts              createApp(deps): deps on the context, CORS, /api/auth/*, /health, onError; mounts routers
  src/deps.ts             Deps + buildDeps(config, overrides): the composition root
  src/middleware.ts       AppEnv type (c.var.deps, c.var.user), requireUser, rateLimit (per-IP, mounted for every route in app.ts)
  src/services/           vendor-neutral services (config, error-handler, geocoder, mailer, otp, price-portal,
                          classifier: Product types for the Price sync)
  src/providers/<vendor>/ each service's implementation + fake.ts (nominatim, openai, price-portals, resend, sentry)
  src/jobs/               fetch-prices, ingest-prices, geocode-stores, price-sync (one Price sync), sync-worker (once-a-minute check)
  src/ingest/             price-file rules: chain seeds (chains.ts), file names (files.ts), parser (parse.ts), DB writes (ingest.ts),
                          the Price sync's Product type step (product-types.ts)
  src/prices/             query-time price rules: Product groups (groups.ts), stores within a radius (nearby.ts),
                          Promotions (promotions.ts), Home and Promotions cards and product pages (browse.ts)
  src/auth.ts             createAuth(db, config, otp): better-auth (email+password, optional Google/Apple, expo plugin)
  src/auth/               one auth feature per file as better-auth plugins (password-reset.ts: Reset codes from the OtpService)
  src/deletion/           web page for Account deletion and Data deletion (/account; /delete-account, /delete-data lead there): logic + htmx steps
  src/emails/             one file per email (reset-code.ts, deletion-code.ts) + layout.ts (Hebrew-first bilingual text and HTML)
  src/db/index.ts         openDb(path): better-sqlite3 + Drizzle; WAL; runs migrations, seeds chains
  src/db/schema.ts        better-auth tables (generated) + re-export of appSchema.ts
  src/db/appSchema.ts     app tables (lists, items, stores, prices...)
  src/db/users.ts         queries about Users that no single route owns (hasPassword)
  src/routes/*.ts         feature routers (lists.ts, prices.ts, browse.ts, privacy.ts, deletion.ts)
  src/utils/clock.ts      Clock, systemClock, fakeClock
  tests/                  all API tests, mirroring src/; fixtures in tests/__fixtures__/
  drizzle/                generated SQL migrations (committed)
apps/mobile/              Expo SDK 58 + expo-router app
  app/                    file routes: (auth)/onboarding|sign-in, (drawer)/ (drawer navigator: (tabs)/ with
                          (home)/index|type/[id]|group/[ref], list, promotions/index|group/[ref] and compare; items,
                          settings as drawer screens), recent, share (modal), item/[id], quantity/[id], breakdown and
                          lists (form sheets), join/[code]
  src/lib/auth-client.ts  better-auth Expo client (SecureStore)
  src/lib/api.ts          api<T>(path, init): fetch wrapper with base URL + auth cookie
  src/lib/analytics.ts    the only PostHog import: track(event), screen, identity (useAnalytics.ts: root layout hook)
  src/lib/strings.ts      en + he strings; t("key") picks the device language (expo-localization)
  src/features/<feature>/ auth, onboarding, lists (data layer + shopping list), items, compare (+ format.ts: fmt,
                          shekels, formatDistance), share, geofence (task.ts = background task, imported by _layout), tabs, drawer,
                          home (Product types, group cards, product pages; card.ts: what a card shows and sends), promotions
  src/ui/                 UI kit: Button, Text, TextField, Screen, Tap, Divider, IconButton, Group/SectionHeader, Row, ListRow,
                          LargeTitle, SearchField, EmptyState, SwipeRow, Toast, Sheet/SheetHeader/SheetField/SheetTextField
                          (sheet route body) (import from "@/ui")
  src/theme/              useTheme(), springs, text() (imports docs/design/tokens.json directly; import from "@/theme")
  tests/                  all mobile tests, mirroring src/ (vitest.config.ts maps "@/" to src/)
packages/shared/          @grocer/shared: rules both apps share, as plain TS with no build (otp.ts: OTP,
                          codeStatus; quantity.ts; product-types.ts: PRODUCT_TYPES in display order). Import by subpath:
                          "@grocer/shared/otp", "@grocer/shared/product-types". Tests in packages/shared/tests/
docs/                     research and design notes (docs/research/, docs/design/)
```

## Commands (run from the repo root)

```bash
npm install                       # all workspaces
npm run dev:api                   # node --watch, http://localhost:3000
npm run dev:mobile                # expo start for the dev build (expo-dev-client); no Expo Go
npm run ios|android -w apps/mobile   # expo run:ios|android: build + install the dev build locally
npm run typecheck                 # tsc --noEmit in both apps
npm test                          # vitest run in both apps
npm run db:generate -w apps/api   # drizzle-kit generate after schema changes
npm run db:migrate -w apps/api    # apply migrations manually (the API also does it on startup)
npm run fetch -w apps/api -- --chain <key> --out <dir> [--max-stores N] [--stores-only]   # download Stores + PriceFull (outside the repo)
npm run ingest -w apps/api -- --chain <key> --stores <file> --prices <file...>   # load price-transparency XML
npm run geocode -w apps/api -- [--chain <key>]   # fill stores.lat/lng via Nominatim (NOMINATIM_URL), 1 req/s
npm run sync -w apps/api -- [--max-stores N]     # one Price sync now: every chain, every store, recorded in sync_runs
npm run worker -w apps/api                       # long-running worker: Scheduled syncs (SYNC_TIMES) + Manual sync requests
npx auth@latest generate --config auth.config.ts --output src/db/schema.ts   # (in apps/api) only after adding better-auth plugins; re-append the appSchema re-export
```

Install Expo packages with `npx expo install <pkg>` inside `apps/mobile` so SDK-pinned versions win.
If api.expo.dev is unreachable, prefix it with `EXPO_OFFLINE=1`.

## Conventions

General
- TypeScript strict everywhere. ESM. In `apps/api`, import through `#/` with the `.ts` extension, never relative (`#/deps.ts`).
- Smallest change that works. No new dependency for a few lines.
- A rule both apps must agree on (limits, durations, pure logic) lives once in `packages/shared`, never copied.
  Erasable TS only (no enum), no dependencies, no Node or React Native imports; add each module to its `exports`.
- All product analytics (screen views, taps, feature events) are captured by the mobile app through
  `@/lib/analytics`, never the PostHog SDK directly; the API sends none. The distinct id is the better-auth `user.id`. Event properties carry ids, counts and enums only: no names, emails, item names or free text.
  Event and tap names are never string literals at call sites: use the `as const` maps (`Events`, `Taps` in
  `@/lib/analytics`) and add new names there.
- Secrets come from env only. List every new env var in the app's `.env.example` and in README.md.

API (`apps/api`): follow `apps/api/ARCHITECTURE.md`
- One Hono router per feature: `src/routes/<feature>.ts` exports a chained `new Hono<AppEnv>()`.
  Mount it in `createApp` (`src/app.ts`) with `.route("/api/<feature>", <feature>Routes)`.
- Read dependencies from `c.var.deps` (db, auth, clock, services). Never import `db` or a provider into a route or job.
- Vendors sit behind a service in `src/services/` with a provider and a fake in `src/providers/<vendor>/`; `deps.ts` wires them.
- Protect routes with `requireUser` (from `src/middleware.ts`); read the user with `c.var.user`.
- Every route is rate limited per client IP by `rateLimit` in `createApp`; add a stricter `.use(path, rateLimit(...))` there
  for anything guessable (sign-in, sign-up and Reset codes have one). better-auth's own limiter is off.
- Validate every request body, query and param with zod at the HTTP boundary. Return 400 on failure.
- Tables live in `src/db/appSchema.ts`. Never hand-edit the better-auth tables in `schema.ts`.
- Schema change: edit `appSchema.ts`, run `npm run db:generate -w apps/api`, and commit the new `drizzle/` files.
  Never edit a migration after it has been committed.

Mobile (`apps/mobile`)
- Screens are expo-router file routes under `app/`. Keep route files thin and put logic in `src/features/<feature>/`.
- Import with `@/` (maps to `src/` and `app/`), e.g. `import { api } from "@/lib/api"`.
- Server state uses TanStack Query (`QueryClientProvider` is set up in `app/_layout.tsx`) and calls `api()`.
  Use zustand only for local UI state.
- Auth uses `authClient` (`authClient.useSession()`, `signIn.*`, `signOut()`). The root layout switches
  between the `(auth)` and signed-in (`(drawer)`, `share`, `join/[code]`) groups with `Stack.Protected`.
- Tabs have `headerShown: false`; each screen renders its own `largeTitle` inside `<Screen edges={["top"]}>`.
- Sheets are routes: a Stack screen in `app/_layout.tsx` with the shared `sheet` options (native `formSheet`,
  `fitToContents`) whose component renders `<Sheet>`. Open with `router.push`, close with `router.back()`;
  pass small data as params and read the rest from the TanStack Query cache.
- Optimistic mutations snapshot in `onMutate` and roll back in `onError`; polling screens pass `poll: useIsFocused()`.
- Motion uses Reanimated 4. babel-preset-expo adds the `react-native-worklets/plugin` automatically,
  so there is no babel.config.js. Gestures use react-native-gesture-handler 3.
- Colors, spacing and type come from `useTheme()` (`colors`, `space`, `radius`, `font`, `motion`, `shadow`); the app is light-only;
  `space` is the token array by index (`space[5]` = 16).
  Never write color literals (hex/rgb) outside `src/theme`. Use `<Text variant>` or `text(variant)` for type.
- Motion goes through `springs` (`withSpring(v, springs.snappy)`) and respects `useReducedMotion()`.
- Every touchable has an `accessibilityLabel` (`Tap`/`IconButton` require it). Build pressables on `Tap`.
- Every touchable has an `analyticsName` from `Taps` (`Tap` requires it and tracks each press as a `tap` event),
  e.g. `analyticsName={Taps.compareNavigate}`. Values are stable, language-neutral, never user data.
  Screen views are tracked by route pattern in the root layout. A raw `Pressable` or `Switch` calls
  `trackTap(Taps.x)` itself.
- Every user-facing string goes through `t()` (fill `{name}` with `fmt`). Add the key to both `en` and `he`
  in `src/lib/strings.ts`; typecheck fails if `he` misses one.
- The app is Hebrew-first. Layouts must work in RTL: use `start`/`end`, not `left`/`right`.

## Testing

- Both apps use vitest (`npm test`). Tests live in each app's `tests/` folder, mirroring `src/`
  (`src/routes/lists.ts` -> `tests/routes/lists.test.ts`), and import the code through `#/` (api) or `@/` (mobile).
- API tests call `createApp(deps).request()` with `deps = buildDeps(loadConfig())`: `vitest.config.ts` sets
  `DATABASE_URL=:memory:`, so each `buildDeps` opens a fresh DB (see `apps/api/tests/app.test.ts`). Swap a dependency
  with an override (`buildDeps(config, { geocoder: fakeGeocoder() })`). Sign up through
  `/api/auth/sign-up/email` and reuse the returned cookie to test protected routes. Jobs: call the handler with fakes.
- Mobile tests cover plain TS logic (`src/lib`, `src/features/*`) and mock `@/lib/auth-client` and `fetch`.
  vitest runs in Node, so don't import React Native in tests.

## Git

- Conventional commits: `feat(api): ...`, `fix(mobile): ...`, `chore: ...`, `docs: ...`, `test: ...`.
- Keep commits small and scoped to one app where possible. Never commit `.env` or `*.db`.

## Definition of done

- [ ] `npm run typecheck` and `npm test` pass at the root.
- [ ] New logic has tests. New endpoints have a `createApp(deps).request()` test that includes the 401 case.
- [ ] No TODOs, commented-out code or console noise left behind.
- [ ] Every touchable has `accessibilityRole`, `accessibilityLabel` and an `analyticsName` (or its own `trackTap`).
- [ ] Screens render correctly in RTL (Hebrew) and LTR.
- [ ] Every new env var is in `.env.example` and README.md. Migrations are generated and committed.

## Agent roles

| Role | Writes to |
| --- | --- |
| research | `docs/research/*.md` (stack facts, price-data sources) |
| design | `docs/design/` (tokens.json, screen specs). `apps/mobile/src/theme/tokens.ts` imports tokens.json directly |
| api | `apps/api/src/` (routes, jobs, services, providers, ingest, db/appSchema.ts), `apps/api/drizzle/`, `apps/api/src/app.ts` (router mounting only) |
| mobile | `apps/mobile/app/`, `apps/mobile/src/features/`, `apps/mobile/src/ui/`, `apps/mobile/src/theme/` |
| api, mobile | `packages/shared/` (ask first: a change reaches both apps) |
| test | `apps/api/tests/`, `apps/mobile/tests/` and `packages/shared/tests/`. Changes no production code except to fix a bug it found, flagged in the commit |

Agents working in parallel stay inside their own paths. Ask before changing a shared file such as
`app.ts`, `_layout.tsx`, `package.json` or this file.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `OrhayBenaim/super-app` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Frontend and design

Any UI or design work, and any request to "use frontend skills", runs the `frontend` skill
(`.claude/skills/frontend/SKILL.md`) first: it loads impeccable, emil-design-eng, awesome-design-md,
frontend-design and the rest of the design skills in order.
