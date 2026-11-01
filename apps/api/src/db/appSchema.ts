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
    missing: integer("missing", { mode: "boolean" }).notNull().default(true),
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
  (t) => [primaryKey({ columns: [t.storeId, t.code] }), index("prices_code_idx").on(t.code)],
);
