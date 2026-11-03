---
status: accepted
---

# The worker runs on its own machine and writes through the api

Price syncs spiked CPU and memory on the VPS that serves the api, so the worker moves to any machine on the tailnet
(using an Israeli exit node only when its host is outside Israel). The SQLite database stays on the api's machine, and the
worker never opens it: it downloads, decodes, parses and geocodes, then sends final rows to private api endpoints over
Tailscale (`tailscale serve`, `SYNC_TOKEN` bearer). The api keeps the schedule and every sync rule; the worker is a
stateless executor that asks the api once a minute for a run.

## Considered options

- **Share the SQLite file** (as before): forces api and worker onto one host, which is the problem.
- **Replicate the database to the worker** (Litestream, libSQL): a second write path and a new piece of infrastructure
  for three syncs a day.
- **Worker sends raw price files, api parses them**: keeps the expensive part (XML parsing) on the VPS.
- **Worker owns the schedule**: the skip rules are queries on `sync_runs`, which lives with the api; splitting them across
  machines needs more endpoints and lets two workers race.

## Consequences

- A Chain is sent only once it is fully processed, in batches of about 20 MB that never split a store. Batch size is not
  transaction size: the api writes one store per transaction and yields between them, because better-sqlite3 blocks the
  event loop and user requests must not wait behind a whole batch.
- Code is split by who owns the data, with no runtime code shared: chain seeds, parsing and `isGtin` live in the worker
  (it sends each chain row; the api no longer seeds chains); Produce groups live in the api (it computes `group_key` on
  write, because search must use the same `stem`). Only the request contract is shared, as types in `@grocer/shared/sync`.
- The api cannot see the worker die, so a run still running 4 hours after it started becomes an Interrupted sync, and
  the api rejects writes for a run that is no longer running. A worker that starts up marks its leftover run interrupted.
- A single price file that fails no longer fails its Chain (that store keeps its previous prices), because a Chain is now
  sent all at once and one bad file would otherwise hold back every store.
- The one-off `fetch`, `ingest`, `geocode` and `sync` jobs are removed: one write path only.
