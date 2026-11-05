---
status: accepted
---

# The Internal dashboard is its own service and writes only through the api

The Internal dashboard is a separate Hono + htmx service on the api's host. It joins a Tailscale sidecar
(`network_mode: service:<sidecar>`) and `tailscale serve` publishes it on the tailnet only: it has no public domain and no
sign-in, because the tailnet is the access control and the team is one person. It never opens the SQLite file. It reads and
writes through the api's private app with the `SYNC_TOKEN` bearer, the same way the worker does (ADR 0002), so the api stays
the only writer.

## Considered options

- **Pages inside the api's private app**: least code, but every dashboard change ships and restarts the api that serves users.
- **A service that opens the SQLite file**: a second writer next to the api, which ADR 0002 removed.
- **A separate `DASHBOARD_TOKEN`**: limits a leaked worker token, but both callers sit on the same private network, run by
  the same person.
- **Datasette, Grafana or an admin framework**: no code, but none can show the Price sync's own states or make edits that
  follow the sync rules.

## Consequences

- Every view and every edit needs a private api endpoint; the dashboard holds no data and no rules of its own.
- The dashboard only shows. Alerts stay in Sentry, which the Price sync already reports to.
- Edits record no author.
