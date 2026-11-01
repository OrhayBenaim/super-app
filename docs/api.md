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
| POST | `/lists/:id/items` | `{ name, category, productCode?, missing? = true }` | `Item` |
| PATCH | `/lists/:id/items/:itemId` | `{ name?, category?, productCode? (null clears), missing? }` | `Item` |
| DELETE | `/lists/:id/items/:itemId` | | 204 |
| GET | `/lists/:id/categories` | | `string[]` distinct categories, most-used first (autocomplete) |
| POST | `/lists/:id/invite` | | `{ code, url }` — rotates the invite code; `url = grocer://join/<code>` |
| POST | `/lists/join` | `{ code }` | `List` (adds caller as member) |
| DELETE | `/lists/:id/members/:userId` | (owner, or self to leave) | 204 |

```ts
type List = { id; name; ownerId; role: "owner"|"member"; memberCount: number; updatedAt }
type Member = { userId; name; email; role }
type Item = { id; listId; name; category; productCode: string|null; missing: boolean; createdAt; updatedAt }
```
Any item/list mutation bumps `list.updatedAt`. Realtime: the mobile app polls `GET /lists/:id` (refetchInterval ~5s while focused). `shortcut: polling instead of websockets, upgrade when >2 members per list is common`.

## Products, stores, compare (`routes/prices.ts`)

Price data comes from the Israeli Price Transparency files (see `docs/research/price-data.md`). `productCode` = the file's `ItemCode` (EAN barcode for packaged goods).

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/products/search` | `?q=<text>&limit=20` | `Product[]` |
| POST | `/compare` | `{ lat, lng, radiusKm?=10, codes: string[], sort?: "price"\|"distance"\|"coverage", limit?=20 }` | `{ stores: StoreResult[], unmatched: string[] }` |
| GET | `/chains` | (public) | `Chain[]` |

```ts
type Product = { code; name; manufacturer: string|null; unitQty: string|null; storeCount: number; minPrice: number }
type Chain = { id; name; nameHe; orderUrl: string|null }   // orderUrl: online shop home or search URL template with {code}
type StoreResult = {
  storeId; chainId; chainName; storeName; address; city; lat; lng; distanceKm;
  total: number;              // sum of prices for matched codes
  matched: number;            // codes this store carries
  missingCodes: string[];     // codes it does not carry
  items: { code; price }[];
  orderUrl: string|null;
}
```
Sort semantics: `price` → fewest missing first, then lowest total; `distance` → nearest; `coverage` → most matched, then price. Stores without coordinates are excluded. `unmatched` = codes no store in radius carries.

Ingestion (CLI, not HTTP): `npm run ingest -- --chain <chainKey> [--stores <file>] [--prices <file...>]` parses Stores + PriceFull XML (gz/zip/plain, UTF-8 or UTF-16) into `stores`, `products`, `prices`. Geocoding: `npm run geocode` fills `stores.lat/lng` via Nominatim from `address + city` (cached, 1 req/s).
