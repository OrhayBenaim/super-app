# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One operator: the person who runs Grocer alone. They open the Internal dashboard on a desktop or laptop browser, over
the team's private network (tailnet), to check on the price data and fix it. There is no second role and no sign-in.

## Product Purpose

The Internal dashboard is where the Grocer team watches and corrects the price data that the Grocer app compares:
Chains and their stores, Products, Product groups, Promotions and Price syncs. Success is noticing a failing Chain, a
store with no location or a wrong address, or a Product in the wrong Product type, and fixing it in a minute, without
reading logs or raw SQLite. See CONTEXT.md (Internal dashboard) and spec GitHub #168.

## Operating Context

- Opened on demand, a few times a day, and after a Price sync (three Scheduled syncs a day, plus Manual syncs).
- The usual path: Price syncs (home) → a run with a Chain failure → that Chain's stores → a store → fix it; or
  Products → search → a Product → its prices, Promotions and Product type.
- Real data: about 1,100 stores across a dozen Chains, about 130,000 Products, millions of prices, tens of thousands
  of Promotions. Store, Chain and Product names are Hebrew; the dashboard's own labels are English.
- Alerts stay in Sentry; the dashboard only shows.

## Capabilities and Constraints

- Pages: Price syncs (history, run detail, Manual sync button), Chains, Stores (map and table, filters, store page with
  edit), Products (search, Product type filter, Product page with prices, Promotions and type fix), Product groups,
  a store's Promotions and one Promotion.
- Edits: a store's name, address, city and location; a Product's type and Product image; Product groups (add or remove Products, rename, Made groups). Prices, Promotions and Chains are not editable.
- Server-rendered HTML with htmx (Hono, apps/dashboard); Leaflet with OpenStreetMap tiles for the map. No client
  framework.
- Desktop only: no phone layout is needed.
- UI language English, left to right; Hebrew data is shown right to left inside it.
- Not yet built (blocked on #67/#68): Store failures and live progress of a running Price sync. Designs may show
  where they will go.

## Brand Commitments

Part of Grocer: it follows the Grocer design system (docs/design/DESIGN.md, docs/design/tokens.json) adapted to a
desktop web tool, not a new identity.

## Evidence on Hand

The local copy of the real price data (grocer-bench) gives real Chain, store, Product and Promotion names and counts
for designs. No Store failure data exists yet.

## Product Principles

- Problems first: what failed or needs a fix is the first thing a page shows.
- Every fix is one step from where the problem is shown.
- The dashboard shows the price data as the Grocer app will use it, never a second version of the rules.
- Dense and plain over decorated: it is a tool used by its builder.
