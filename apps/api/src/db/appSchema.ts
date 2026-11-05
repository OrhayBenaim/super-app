// App (non-auth) tables go here; re-exported from schema.ts.
import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "#/db/schema.ts"; // circular with schema.ts, safe because references() is lazy

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull();

export const lists = sqliteTable("lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const listMembers = sqliteTable(
  "list_members",
  {
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.userId] }), index("list_members_userId_idx").on(t.userId)],
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    productCode: text("product_code"),
    groupRef: text("group_ref"), // a Product group (src/prices/groups.ts); never set with productCode
    missing: integer("missing", { mode: "boolean" }).notNull().default(true),
    quantity: real("quantity").notNull().default(1), // a count, or kilos when the item is sold by weight (@grocer/shared/quantity)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("items_listId_idx").on(t.listId)],
);

// Price-transparency data (docs/research/price-data.md). products_fts (FTS5) lives in a custom migration.
export const chains = sqliteTable("chains", {
  id: text("id").primaryKey(), // ChainId, e.g. 7290058140886
  key: text("key").notNull().unique(), // e.g. "rami-levy"
  name: text("name").notNull(),
  nameHe: text("name_he").notNull(),
  orderUrl: text("order_url"), // shop home, or a cart link template with {items}
  onlineStoreId: text("online_store_id"), // stores.id of the store whose prices are the online shop's, if the files have one
});

export const stores = sqliteTable(
  "stores",
  {
    id: text("id").primaryKey(), // `${chainId}-${storeId}`
    chainId: text("chain_id")
      .notNull()
      .references(() => chains.id),
    storeId: text("store_id").notNull(),
    subChainId: text("sub_chain_id").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    // What the Chain's Stores file says now, set every Price sync; the fields above change only on the dashboard (ADR 0006).
    publishedAddress: text("published_address").notNull().default(""),
    publishedCity: text("published_city").notNull().default(""),
  },
  (t) => [index("stores_lat_lng_idx").on(t.lat, t.lng)],
);

// The fixed list of Product types (docs/adr/0003), upserted by openDb from PRODUCT_TYPES; position is display order.
export const productTypes = sqliteTable("product_types", {
  id: text("id").primaryKey(),
  position: integer("position").notNull(),
});

export const products = sqliteTable("products", {
  code: text("code").primaryKey(), // ItemCode if a valid GTIN, else `${chainId}:${ItemCode}`
  itemCode: text("item_code"), // raw ItemCode as published
  name: text("name").notNull(),
  manufacturer: text("manufacturer"),
  unitQty: text("unit_qty"),
  isWeighted: integer("is_weighted", { mode: "boolean" }).notNull().default(false),
  // Null until a Price sync classifies it (an untyped Product counts as Other); clearing it sends it again.
  productType: text("product_type").references(() => productTypes.id),
});

export const prices = sqliteTable(
  "prices",
  {
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    code: text("code")
      .notNull()
      .references(() => products.code),
    price: real("price").notNull(),
    unitPrice: real("unit_price"),
    updatedAt: updatedAt(),
  },
  // Covering: search and Compare read a code's stores and prices from the index alone, never the table rows.
  (t) => [primaryKey({ columns: [t.storeId, t.code] }), index("prices_code_store_price_idx").on(t.code, t.storeId, t.price)],
);

// Price syncs (CONTEXT.md "Prices"). One row per Price sync, Skipped sync or Manual sync request.
export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trigger: text("trigger", { enum: ["scheduled", "manual"] }).notNull(),
  status: text("status", { enum: ["requested", "running", "finished", "interrupted", "skipped", "ignored"] }).notNull(),
  skipReason: text("skip_reason", { enum: ["manual_sync", "sync_running"] }),
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
  requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  // The Product type step: Products that got a type, how many of them Other, failed requests. Null when it didn't run.
  productsTyped: integer("products_typed"),
  productsOther: integer("products_other"),
  typeRequestsFailed: integer("type_requests_failed"),
});

export const syncChainResults = sqliteTable(
  "sync_chain_results",
  {
    syncRunId: integer("sync_run_id")
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    chainId: text("chain_id")
      .notNull()
      .references(() => chains.id),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    filesDownloaded: integer("files_downloaded").notNull(),
    storesLoaded: integer("stores_loaded").notNull(),
    pricesLoaded: integer("prices_loaded").notNull(),
    storesGeocoded: integer("stores_geocoded").notNull(),
    durationMs: integer("duration_ms").notNull(),
    error: text("error"),
    // The Chain's Promotions, apart from its own status (CONTEXT.md "Promotion failure"); null when the Chain failed first.
    promotionsLoaded: integer("promotions_loaded").notNull().default(0),
    promotionStatus: text("promotion_status", { enum: ["ok", "failed"] }),
    promotionError: text("promotion_error"),
  },
  (t) => [primaryKey({ columns: [t.syncRunId, t.chainId] })],
);

// A store's Promotions as its newest promotion files publish them (#118); Compare applies the running ones.
// kind and audience are TS-only enums (SQLite text), so a later reward kind or audience needs no migration.
export const promotionKinds = ["price", "bundle", "percent", "nth", "off", "info"] as const;
export type PromotionKind = (typeof promotionKinds)[number];
export const audiences = ["all", "club", "card", "coupon"] as const;
export type Audience = (typeof audiences)[number];
export const promotions = sqliteTable(
  "promotions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    promotionId: text("promotion_id").notNull(), // the Chain's PromotionID
    description: text("description").notNull(),
    // price: one unit at `amount`; bundle: `minQty` units for `amount` in total; percent: `amount` percent off;
    // nth: the cheapest of every `minQty` units `amount` percent off (100 = "2+1"); off: ₪`amount` off every `minQty` units;
    // info: information only (shown with its description, never in a total).
    // A unit is a kilo when the product is weighed, so bundle's `minQty` may be a weight (0.25).
    kind: text("kind", { enum: promotionKinds }).notNull(),
    minQty: real("min_qty").notNull(),
    amount: real("amount").notNull(),
    audience: text("audience", { enum: audiences }).notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    days: text("days"), // weekdays it runs, "1,6" (1 = Sunday); null = every day
    limitQty: real("limit_qty"), // units per purchase that get it; null = no limit
    // A spend deal: it counts only when the rest of the List, without its own products, costs at least this; null = none.
    minPurchase: real("min_purchase"),
    // AllowMultipleDiscounts (false = the Chain says a spend deal doesn't stack on other Promotions).
    // shortcut: AllowMultipleDiscounts is ignored, use it when a Chain's till is shown to refuse stacking
    combines: integer("combines", { mode: "boolean" }).notNull().default(true),
    // The store's Chain, read from its id (ingest writes `${chainId}-${storeId}`), so the dashboard groups a Chain's
    // Promotions from one index instead of joining stores for every row.
    chainId: text("chain_id").generatedAlwaysAs(sql`substr(store_id, 1, instr(store_id, '-') - 1)`, { mode: "virtual" }),
  },
  (t) => [
    uniqueIndex("promotions_store_promotion_idx").on(t.storeId, t.promotionId),
    index("promotions_chain_promotion_idx").on(t.chainId, t.promotionId, t.kind, t.startsAt, t.endsAt),
  ],
);

export const promotionItems = sqliteTable(
  "promotion_items",
  {
    promotionId: integer("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // keyed like prices.code; no FK, a promoted product may have no price row
  },
  (t) => [primaryKey({ columns: [t.promotionId, t.code] }), index("promotion_items_code_idx").on(t.code)],
);

// Browse's copy of the price data (src/prices/browse-data.ts), so a Home or Promotions request reads a few hundred rows,
// not every nearby price: Products numbered for packed lists, each store's prices and Promotions packed into one row as
// ingest writes them, a Chain's Promotion terms stored once, and every Product's group card worked out by each Price sync.
export const browseProducts = sqliteTable("browse_products", {
  id: integer("id").primaryKey(), // the Product's number in packed lists; never reused
  code: text("code").notNull().unique(), // keyed like prices.code; no FK, a promoted product may have no price row
  // Its normalized name words (space-separated), written with browse_groups for a priced Product.
  words: text("words"),
});

export const storeBrowse = sqliteTable("store_browse", {
  storeId: text("store_id")
    .primaryKey()
    .references(() => stores.id, { onDelete: "cascade" }),
  products: blob("products", { mode: "buffer" }).notNull(), // Int32 browse_products ids, ascending
  prices: blob("prices", { mode: "buffer" }).notNull(), // Float64 Shelf prices, in the same order
  // The store's Promotions on each Product: Int32 browse_products ids, ascending, and the chain_promotions id of each.
  offerProducts: blob("offer_products", { mode: "buffer" }).notNull(),
  offerPromotions: blob("offer_promotions", { mode: "buffer" }).notNull(),
});

// One Chain's Promotion terms as its stores publish them: stores with the same PromotionID and terms share a row.
export const chainPromotions = sqliteTable("chain_promotions", {
  id: integer("id").primaryKey(),
  key: text("key").notNull().unique(), // hash of the Chain, PromotionID and terms
  chainId: text("chain_id").notNull(),
  promotionId: text("promotion_id").notNull(),
  description: text("description").notNull(),
  kind: text("kind", { enum: promotionKinds }).notNull(),
  minQty: real("min_qty").notNull(),
  amount: real("amount").notNull(),
  audience: text("audience", { enum: audiences }).notNull(),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  days: text("days"),
  limitQty: real("limit_qty"),
  minPurchase: real("min_purchase"),
});

// Browse's group cards (docs/adr/0001's rules over every priced Product), rewritten by each Price sync.
export const browseGroups = sqliteTable("browse_groups", {
  id: integer("id").primaryKey(),
  type: text("type").notNull(),
  ref: text("ref"), // null: a lone Product with no group ref
  name: text("name").notNull(),
  measure: text("measure").notNull(),
  size: real("size").notNull(),
  soldBy: text("sold_by").notNull(),
});

// One row, written with browse_groups. Per browse_products id: its group (-1: none yet), what its price is divided by
// for its group's price per kilo, liter or pack, whether it is weighed, how many stores price it, and its code and lead
// words (before its first number or size, normalized and as written); per group: its Product type (index into
// PRODUCT_TYPES) and how many stores price any of its Products.
export const browseCatalog = sqliteTable("browse_catalog", {
  id: integer("id").primaryKey(),
  groups: blob("groups", { mode: "buffer" }).notNull(), // Int32
  perUnit: blob("per_unit", { mode: "buffer" }).notNull(), // Float64
  weighted: blob("weighted", { mode: "buffer" }).notNull(), // Uint8
  stores: blob("stores", { mode: "buffer" }).notNull(), // Int32
  groupTypes: blob("group_types", { mode: "buffer" }).notNull(), // Uint8
  groupStores: blob("group_stores", { mode: "buffer" }).notNull(), // Int32
  names: blob("names", { mode: "buffer" }).notNull(), // UTF-8 "code\tlead\tlead as written", one after another
  nameEnds: blob("name_ends", { mode: "buffer" }).notNull(), // Int32: where each Product's ends in names
});
