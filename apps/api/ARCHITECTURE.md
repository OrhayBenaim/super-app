# api architecture

How the code inside `apps/api` is organised.

## Layout

| Path | What |
|---|---|
| `src/api.ts` | `api` entry point: loads config, builds `Deps`, serves `createApp`. |
| `src/worker.ts` | `worker` entry point: runs one job (see [Jobs](#jobs)). |
| `src/jobs/<job>.ts` | One handler per job. |
| `src/app.ts` | `createApp(deps)`: app-wide middleware and error handling, and mounts the routers. No route logic. |
| `src/internal-app.ts` | `createInternalApp(deps)`: the private trigger (`POST /sync`), served by `api.ts` on its own internal port. |
| `src/middleware.ts` | `AppEnv` (the context variables), `requireUser`, and `rateLimit({ max, windowMs })`: per client IP, in memory. `createApp` mounts it for every route, with stricter limits on sign-in, sign-up and `/api/auth/email-otp/*`. |
| `src/routes/<resource>.ts` | One router per resource. |
| `src/deps.ts` | Composition root: `buildDeps(config, overrides)` builds every dependency once. |
| `src/auth.ts` | `createAuth(db, config, mailer)`: the better-auth instance. It wires features; each feature's own rules live in `src/auth/`. |
| `src/auth/<feature>.ts` | One auth feature as better-auth plugins, e.g. `password-reset.ts`: `passwordReset(db, mailer)` (emailOTP plus the hook that lets only Users with a password in) and `unusedOtpPaths`. |
| `src/emails/<email>.ts` | One function per email that builds it from its data (e.g. `resetCodeEmail(to, code)`). `emails/layout.ts` turns Hebrew and English paragraphs into the text and HTML every email shares. Send through the `MailerService` (`deps.mailer`, or the `mailer` that `createAuth` receives). |
| `src/services/` | One file per vendor-neutral service (see [Services and providers](#services-and-providers)). |
| `src/providers/<vendor>/` | Each vendor's implementation of a service, and its fake. |
| `src/ingest/` | Price-file rules: chain seeds, file names, XML parsing, writing stores and prices. |
| `src/db/` | Drizzle schema and `openDb()`. Migrations are in `drizzle/`. Queries that belong to no single route take `db` first and live by what they ask about (e.g. `users.ts`: `hasPassword(db, email)`). |
| `src/utils/` | Small stateless helpers (e.g. `clock.ts`). |
| `tests/` | All tests (see [Tests](#tests)). |

## Imports

Import anything in `src/` through the `#/` alias, never with relative paths: `import { buildDeps } from "#/deps.ts"`. The alias is Node's subpath `imports` field in `package.json` (`"#/*": "./src/*"`), so Node, tsc and Vitest all resolve it with no extra config. Node requires these aliases to start with `#`, so `~` or `@` would need a loader hook.

Node runs the TypeScript directly (type stripping, Node 24.14+), so there is no build step: `npm start` is `node src/api.ts`. That is why imports end in `.ts`, type-only imports use `import type`, and `tsconfig.json` sets `erasableSyntaxOnly` (no `enum`, `namespace` or constructor parameter properties).

Rules the app must agree with (e.g. how long a Reset code lasts) come from the `@grocer/shared` workspace package (`packages/shared`): `import { RESET_CODE } from "@grocer/shared/reset-code"`. It is plain TypeScript too; Node strips its types because the workspace link resolves outside `node_modules`.

## Services and providers

A **service** is a vendor-neutral module for one kind of work: config, error handling, geocoding. It never names a vendor: there is a `Geocoder` service, not a Nominatim service, and an `ErrorHandler`, not a Sentry service. A **provider** is one vendor's implementation behind a service. The rest of the code depends only on services.

```
src/services/<service>.ts          the service: types and interface we own, plus a class if it has logic
src/providers/<vendor>/<vendor>.ts the real provider, e.g. providers/nominatim/nominatim.ts
src/providers/<vendor>/fake.ts     its fake
```

- **The service defines the types; the provider adapts to them.** A provider turns the vendor's shapes into the service's types at its edge. Nothing outside `providers/<vendor>/` knows a vendor field name, so swapping a vendor means writing one new provider.
- **A class only when there's logic.** When a service only forwards (geocoding, error reporting), its file is just the interface, and the provider implements it directly. When it has vendor-neutral logic, the file holds a `<Name>Service` class plus the `<Name>Provider` interface its provider implements.
- **One provider per service.** Several providers may exist, but `deps.ts` picks exactly one for each service. Nothing else creates services or imports a provider.
- **Every provider has a fake** in its folder. A fake for a service whose vendor is not added yet goes in `providers/fake-<service>/fake.ts` and moves when the vendor is added.

| Service | Interface | Provider folder |
|---|---|---|
| `config.ts` | `Config` | none: env vars, validated with Zod |
| `error-handler.ts` | `ErrorHandler` | `sentry/` (its fake when `SENTRY_DSN` is unset) |
| `geocoder.ts` | `Geocoder` | `nominatim/` |
| `mailer.ts` | `MailerService` (facade over `MailerProvider`) | `resend/` |
| `price-portal.ts` | `PricePortal` | `price-portals/` (the chains' price-transparency portals) |

## Routers

Each resource gets a file in `src/routes/` that exports a Hono app. `createApp(deps)` puts `deps` on the request context with a middleware, so handlers read it from `c.var.deps` (typed by `AppEnv`):

```ts
// src/routes/lists.ts
export const listsRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/:id", (c) => {
    const { db } = c.var.deps;
    /* ... */
  });
```

`app.ts` mounts it under its prefix, so paths inside a router are relative:

```ts
app.route("/api/lists", listsRoutes);
```

Rules:

- **Routers get dependencies only from `c.var.deps`.** No module-level singletons or imports of `db`, so tests can pass fakes through `buildDeps(config, overrides)`.
- **Handlers stay thin.** Parse the request (Zod schemas in the router file), call domain logic, shape the response. Business rules live in plain functions outside the handler so they can be unit-tested without HTTP.
- **Errors go up.** Handlers throw for unexpected failures; `app.onError` in `app.ts` logs them, reports them through `deps.errorHandler` and returns 500. Handle only the errors that map to a specific response.
- **Chain route methods** (`new Hono().get(...).post(...)`) so Hono keeps the route types.
- **Tests** call `createApp(deps).request(path)` from `tests/`, so routing and mounting are covered too.

## Jobs

Jobs mirror routers: `api.ts` mounts `src/routes/*`, `worker.ts` registers `src/jobs/*`.

Each job gets a file in `src/jobs/` that exports a factory taking `Deps` and returning the handler, plus the Zod schema of its data:

```ts
// src/jobs/geocode-stores.ts
export function geocodeStoresJob(deps: Deps) {
  return async (data: GeocodeStoresData) => { /* stores without lat/lng → deps.geocoder → update */ };
}
```

| Job | npm script | What |
|---|---|---|
| `fetch-prices` | `npm run fetch` | Downloads a chain's newest Stores file and PriceFull files through `deps.pricePortal`. |
| `ingest-prices` | `npm run ingest` | Loads Stores and PriceFull files into the database. |
| `geocode-stores` | `npm run geocode` | Fills store coordinates through `deps.geocoder`. |
| `price-sync` | `npm run sync` | One Price sync now: fetch, load and geocode every chain, recorded in `sync_runs`/`sync_chain_results`. |
| `sync-worker` | `npm run worker` | Long-running (`src/jobs/sync-worker.ts`): runs `priceSyncCheck` once a minute (Scheduled syncs, Manual sync requests, Skipped syncs). |

Rules:

- **Jobs take `Deps`, nothing else**, like routers. They call vendors only through `deps` (see [Services and providers](#services-and-providers)).
- **Handlers stay thin.** Business rules live in plain functions outside the handler.
- **`worker.ts` stays thin.** It runs one job by name from the command line (`node src/worker.ts <job> [--flags]`), passes the flags as the job's data, and exits non-zero on failure. Each job validates its data with Zod. Each handler also gets an `AbortSignal` that SIGTERM fires: a Price sync stops after its current chain, other jobs ignore it and finish.
- **Tests** call the handler directly with fakes from `tests/jobs/<job>.test.ts`. No worker process is started.

## Responses don't reveal internals

Public responses never name the database, vendors, versions or other parts of the stack. Put details in the server log, not in the response.

- `GET /health` returns only `{ "status": "ok" }`, or `{ "status": "error" }` with a 503. It checks the database, but the response doesn't say so; the failure is logged as `health check: database unreachable`.
- Unhandled errors return `{ "error": "internal" }` with a 500. The stack trace goes to the log and the error handler only.

## Utils

`src/utils/` holds small, stateless helpers that other modules call, and that need no `Deps`, no I/O and no outside service:

- `clock.ts`: `Clock`, `systemClock`, `fakeClock`.

Anything with I/O or a lifecycle is a service and its provider. Business rules go with their feature, not in `utils/`.

## Tests

- All tests live in `tests/`, never next to source, mirroring the `src/` layout: `src/routes/lists.ts` → `tests/routes/lists.test.ts`. They import code through `#/` like `src/` does. Fixtures are in `tests/__fixtures__/`.
- Integration tests run against an in-memory SQLite database: every `buildDeps(loadConfig())` opens a fresh one. `vitest.config.ts` supplies the env defaults, and no port is opened.
- Swap a dependency by passing an override: `buildDeps(config, { clock: fakeClock(start) })`.
