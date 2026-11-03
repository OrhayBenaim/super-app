# Grocer API contract (v1)

Base: `/api`. Auth: better-auth session cookie (mobile sends `Cookie` from `authClient.getCookie()`). All routes below require a session unless noted. Errors: `{ error: string }` with 400/401/403/404. Bodies validated with zod. Timestamps ISO-8601 strings. IDs are strings.

## Lists, items, categories, sharing (`routes/lists.ts`)

Model: a **list** is shared; **items** belong to a list (not a user). A user's first `GET /lists` auto-creates "My list" and makes them owner.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/lists` | | `List[]` (lists the user is a member of) |
| POST | `/lists` | `{ name }` | `List` |
| GET | `/lists/:id` | | `{ list: List, members: Member[], items: Item[] }` |
| PATCH | `/lists/:id` | `{ name }` (owner) | `List` |
| POST | `/lists/:id/items` | `{ name, category, productCode?, groupRef?, missing? = true }` (not both productCode and groupRef) | `Item` |
| PATCH | `/lists/:id/items/:itemId` | `{ name?, category?, productCode?, groupRef? (null clears; setting one clears the other), missing? }` | `Item` |
| DELETE | `/lists/:id/items/:itemId` | | 204 |
| GET | `/lists/:id/categories` | | `string[]` distinct categories, most-used first (autocomplete) |
| POST | `/lists/:id/invite` | | `{ code, url }` — rotates the invite code; `url = grocer://join/<code>` |
| POST | `/lists/join` | `{ code }` | `List` (adds caller as member) |
| DELETE | `/lists/:id/members/:userId` | (owner, or self to leave) | 204 |

```ts
type List = { id; name; ownerId; role: "owner"|"member"; memberCount: number; updatedAt }
type Member = { userId; name; email; role }
type Item = { id; listId; name; category; productCode: string|null; groupRef: string|null; missing: boolean; createdAt; updatedAt }
// Legacy: app builds from before Product groups (production 1.0.0) know only productCode. So a group item is returned with
// productCode = its groupRef; an item body without groupRef sets the whole match from productCode (a group ref becomes the
// groupRef); a group ref in /compare codes is priced as that group; group search results carry code = ref.
```
Any member may rotate the invite code. "My list" is auto-created only when the user has no lists. Categories are case-sensitive (client autocomplete mitigates). Any item/list mutation bumps `list.updatedAt`. Realtime: the mobile app polls `GET /lists/:id` (refetchInterval ~5s while focused). `shortcut: polling instead of websockets, upgrade when >2 members per list is common`.

## Products, stores, compare (`routes/prices.ts`)

Price data comes from the Israeli Price Transparency files (see `docs/research/price-data.md`). `productCode` = the file's `ItemCode` (EAN barcode for packaged goods).
Product codes: an `ItemCode` that is a valid GS1 barcode (8, 12, 13 or 14 digits, or 11 for a UPC-12 missing its leading 0, with a correct check digit) is global; any other code is chain-scoped as `${chainId}:${itemCode}`.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/products/search` | `?q=<text>&limit=20` | `(ProductGroup \| Product)[]`: the Product groups the query's words name, then up to `limit` products (a digits-only `q` of 8+ chars is a barcode lookup: exact code, then code prefix, products only) |
| POST | `/compare` | `{ lat, lng, radiusKm?=10, codes?: string[], groups?: { ref, amount? }[], sort?: "price"\|"distance"\|"coverage", limit?=20 }` (at least one code or group) | `{ stores: StoreResult[], unmatched: string[] }` |
| GET | `/chains` | (public) | `Chain[]` |

```ts
type Measure = "kg" | "l" | "unit"
type Product = { kind: "product"; code; name; manufacturer: string|null; unitQty: string|null; measure: Measure|null; size: number|null; storeCount: number; minPrice: number }
// A Product group (CONTEXT.md, docs/adr/0001). ref = normalized words|measure[|pack count], e.g. "בורגול|kg", "ביצ|unit|12".
// minPrice: lowest per kilo/liter, or the cheapest pack for "unit". size: commonest pack in kilos/liters, or the pack count.
type ProductGroup = { kind: "group"; ref; name; measure: Measure; size: number; productCount: number; storeCount: number; minPrice: number; refinements: string[] }
type Chain = { id; name; nameHe; orderUrl: string|null }   // orderUrl: online shop home or search URL template with {code}
type StoreResult = {
  storeId; chainId; chainName; storeName; address; city; lat; lng; distanceKm;
  total: number;              // sum of prices for matched codes
  matched: number;            // codes this store carries
  missingCodes: string[];     // codes and group refs it does not carry
  items: ({ code; price } | { ref; code; name; size; unitPrice?; price })[]; // a group item names the product priced
  orderUrl: string|null;
}
```
Sort semantics: `price` → fewest missing first, then lowest total; `distance` → nearest; `coverage` → most matched, then price. Stores without coordinates are excluded. Weighed items (`isWeighted`) are priced per kg and counted as 1 kg in totals. A group is charged its cheapest product at each store: a kilo or liter group by price per kilo/liter (`unitPrice`) × `amount` (kilos or liters, default the group's commonest pack size), a unit group by the cheapest pack × `amount` (packs, default 1). `unmatched` = codes and group refs no store in radius carries.

Ingestion (CLI, not HTTP): `npm run ingest -- --chain <chainKey> [--stores <file>] [--prices <file...>]` parses Stores + PriceFull XML (gz/zip/plain, UTF-8 or UTF-16) into `stores`, `products`, `prices`. Each prices file is a full snapshot: it replaces that store's prices (items no longer listed are dropped), and items with `ItemPrice` <= 0 or NaN are skipped (count logged). Geocoding: `npm run geocode` fills `stores.lat/lng` via Nominatim from `address + city` (cached, 1 req/s).
