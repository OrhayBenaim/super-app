// App (non-auth) tables go here; re-exported from schema.ts.
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
  orderUrl: text("order_url"), // shop home, or a search template with {code}
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
  },
  (t) => [index("stores_lat_lng_idx").on(t.lat, t.lng)],
);

export const products = sqliteTable("products", {
  code: text("code").primaryKey(), // ItemCode if a valid GTIN, else `${chainId}:${ItemCode}`
  itemCode: text("item_code"), // raw ItemCode as published
  name: text("name").notNull(),
  manufacturer: text("manufacturer"),
  unitQty: text("unit_qty"),
  isWeighted: integer("is_weighted", { mode: "boolean" }).notNull().default(false),
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
  },
  (t) => [primaryKey({ columns: [t.syncRunId, t.chainId] })],
);
