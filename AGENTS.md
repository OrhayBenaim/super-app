# AGENTS.md

Grocer: a grocery list and cheapest-supermarket finder for Israel. Users keep a shopping list, and the app
compares what the list costs at nearby supermarkets. This file is for AI agents and humans working in the repo.

## Repo layout

```
apps/api/                 Node 22 + TypeScript (strict, ESM, NodeNext) API
  src/index.ts            starts the HTTP server (PORT, default 3000)
  src/app.ts              Hono app: CORS, /api/auth/*, /health; register routes here
  src/middleware.ts       AppEnv type + requireUser
  src/ingest/             price-file parser (parse.ts), chain seed (chains.ts), ingest/geocode CLIs
  src/auth.ts             better-auth config (email+password, optional Google/Apple, expo plugin)
  src/db/index.ts         better-sqlite3 + Drizzle; WAL; runs migrations on import
  src/db/schema.ts        better-auth tables (generated) + re-export of appSchema.ts
  src/db/appSchema.ts     app tables (lists, items, stores, prices...)
  src/routes/*.ts         feature route modules (lists.ts, prices.ts)
  drizzle/                generated SQL migrations (committed)
apps/mobile/              Expo SDK 58 + expo-router app
  app/                    file routes: (auth)/onboarding|sign-in, (tabs)/index|items|compare|settings, share (modal), join/[code]
  src/lib/auth-client.ts  better-auth Expo client (SecureStore)
  src/lib/api.ts          api<T>(path, init): fetch wrapper with base URL + auth cookie
  src/lib/strings.ts      en + he strings; t("key") picks the device language (expo-localization)
  src/features/<feature>/ auth, onboarding, lists (data layer + shopping list), items, compare (+ format.ts: fmt,
                          shekels, formatDistance), share, geofence (task.ts = background task, imported by _layout), tabs
  src/ui/                 UI kit: Button, Text, TextField, Screen, Tap, Divider, IconButton, Chip, CategoryHeader,
                          EmptyState, SwipeRow, Sheet/SheetTextField (BottomSheetModal) (import from "@/ui")
  src/theme/              useTheme(), springs, text() (imports docs/design/tokens.json directly; import from "@/theme")
docs/                     research and design notes (docs/research/, docs/design/)
```

## Commands (run from the repo root)

```bash
npm install                       # all workspaces
npm run dev:api                   # tsx watch, http://localhost:3000
npm run dev:mobile                # expo start
npm run typecheck                 # tsc --noEmit in both apps
npm test                          # vitest run in both apps
npm run db:generate -w apps/api   # drizzle-kit generate after schema changes
npm run db:migrate -w apps/api    # apply migrations manually (the API also does it on startup)
npm run ingest -w apps/api -- --chain <key> --stores <file> --prices <file...>   # load price-transparency XML
npm run geocode -w apps/api       # fill stores.lat/lng via Nominatim (NOMINATIM_URL), 1 req/s
npx auth@latest generate --config src/auth.ts --output src/db/schema.ts   # (in apps/api) only after adding better-auth plugins; re-append the appSchema re-export
```

Install Expo packages with `npx expo install <pkg>` inside `apps/mobile` so SDK-pinned versions win.
If api.expo.dev is unreachable, prefix it with `EXPO_OFFLINE=1`.

## Conventions

General
- TypeScript strict everywhere. ESM. In `apps/api`, relative imports end in `.js` (NodeNext).
- Smallest change that works. No new dependency for a few lines.
- Secrets come from env only. List every new env var in the app's `.env.example` and in README.md.

API (`apps/api`)
- One Hono route module per feature: `src/routes/<feature>.ts` exports a `new Hono<AppEnv>()`.
  Register it in `src/app.ts` with `app.route("/api/<feature>", <feature>Routes)`.
- Protect routes with `requireUser` (from `src/middleware.ts`); read the user with `c.get("user")`.
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
  between the `(auth)` and signed-in (`(tabs)`, `share`, `join/[code]`) groups with `Stack.Protected`.
- Tabs have `headerShown: false`; each screen renders its own `largeTitle` inside `<Screen edges={["top"]}>`.
- Sheets use `<Sheet open onClose>` (gorhom `BottomSheetModal`; `BottomSheetModalProvider` is in `app/_layout.tsx`).
- Optimistic mutations snapshot in `onMutate` and roll back in `onError`; polling screens pass `poll: useIsFocused()`.
- Motion uses Reanimated 4. babel-preset-expo adds the `react-native-worklets/plugin` automatically,
  so there is no babel.config.js. Gestures use react-native-gesture-handler 3.
- Colors, spacing and type come from `useTheme()` (`colors`, `space`, `radius`, `font`, `motion`, `shadow`, `isDark`);
  `space` is the token array by index (`space[5]` = 16).
  Never write color literals (hex/rgb) outside `src/theme`. Use `<Text variant>` or `text(variant)` for type.
- Motion goes through `springs` (`withSpring(v, springs.snappy)`) and respects `useReducedMotion()`.
- Every touchable has an `accessibilityLabel` (`Tap`/`IconButton` require it). Build pressables on `Tap`.
- Every user-facing string goes through `t()` (fill `{name}` with `fmt`). Add the key to both `en` and `he`
  in `src/lib/strings.ts`; typecheck fails if `he` misses one.
- The app is Hebrew-first. Layouts must work in RTL: use `start`/`end`, not `left`/`right`.

## Testing

- Both apps use vitest (`npm test`). Test files sit next to the code as `*.test.ts`.
- API tests call `app.request()` on the exported app with a temp DB. Set `DATABASE_URL=:memory:`
  before importing `./app.js` (see `apps/api/src/app.test.ts`). Sign up through
  `/api/auth/sign-up/email` and reuse the returned cookie to test protected routes.
- Mobile tests cover plain TS logic (`src/lib`, `src/features/*`) and mock `./auth-client` and `fetch`.
  vitest runs in Node, so don't import React Native in tests.
- Sonnet agents write the tests for features built by other agents.

## Git

- Conventional commits: `feat(api): ...`, `fix(mobile): ...`, `chore: ...`, `docs: ...`, `test: ...`.
- Keep commits small and scoped to one app where possible. Never commit `.env` or `*.db`.

## Definition of done

- [ ] `npm run typecheck` and `npm test` pass at the root.
- [ ] New logic has tests. New endpoints have an `app.request()` test that includes the 401 case.
- [ ] No TODOs, commented-out code or console noise left behind.
- [ ] Every touchable has `accessibilityRole` and `accessibilityLabel`.
- [ ] Screens render correctly in RTL (Hebrew) and LTR.
- [ ] Every new env var is in `.env.example` and README.md. Migrations are generated and committed.

## Agent roles

| Role | Writes to |
| --- | --- |
| research | `docs/research/*.md` (stack facts, price-data sources) |
| design | `docs/design/` (tokens.json, screen specs). `apps/mobile/src/theme/tokens.ts` imports tokens.json directly |
| api | `apps/api/src/routes/`, `apps/api/src/db/appSchema.ts`, `apps/api/drizzle/`, `apps/api/src/app.ts` (route registration only) |
| mobile | `apps/mobile/app/`, `apps/mobile/src/features/`, `apps/mobile/src/ui/`, `apps/mobile/src/theme/` |
| test | `*.test.ts` next to the code in either app. Changes no production code except to fix a bug it found, flagged in the commit |

Agents working in parallel stay inside their own paths. Ask before changing a shared file such as
`app.ts`, `_layout.tsx`, `package.json` or this file.
