import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { chainSeeds } from "#/ingest/chains.ts";
import { groupMembers, groupRef, nameWords, ownGroupRef, parseRef, withoutSizes } from "#/prices/groups.ts";
import * as schema from "#/db/schema.ts";

/** Opens the SQLite file (":memory:" in tests), applies migrations, upserts the chain seeds and Product types, and links old Produce-group items. */
export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });

  for (const { ids, key, name, nameHe, orderUrl, onlineStore } of chainSeeds) {
    const row = { id: ids[0]!, key, name, nameHe, orderUrl, onlineStoreId: onlineStore ? `${ids[0]}-${onlineStore}` : null };
    db.insert(schema.chains).values(row).onConflictDoUpdate({ target: schema.chains.id, set: row }).run();
  }
  for (const [position, id] of PRODUCT_TYPES.entries())
    db.insert(schema.productTypes).values({ id, position }).onConflictDoUpdate({ target: schema.productTypes.id, set: { position } }).run();
  linkProduceItems(sqlite);
  if ((sqlite.pragma("user_version", { simple: true }) as number) < 2) {
    moveDeadGroupRefs(db);
    sqlite.pragma("user_version = 2");
  }
  return db;
}

/**
 * Once per database (user_version 0 -> 1): an item matched to a product that had a Produce group (weighed, or with a
 * chain-local code) is matched to the Product group that product's name makes instead (docs/adr/0001). Items matched
 * to a barcode, and products whose size can't be read, stay as they are.
 */
export function linkProduceItems(sqlite: Database.Database) {
  if ((sqlite.pragma("user_version", { simple: true }) as number) >= 1) return;
  const rows = sqlite
    .prepare(
      `SELECT i.id, p.name, p.unit_qty AS unitQty, p.is_weighted AS isWeighted FROM items i JOIN products p ON p.code = i.product_code
       WHERE p.is_weighted = 1 OR instr(p.code, ':') > 0`,
    )
    .all() as { id: string; name: string; unitQty: string | null; isWeighted: number }[];
  const link = sqlite.prepare("UPDATE items SET group_ref = ?, product_code = NULL WHERE id = ?");
  sqlite.transaction(() => {
    for (const r of rows) {
      const ref = ownGroupRef(r);
      if (ref) link.run(ref, r.id);
    }
    sqlite.pragma("user_version = 1");
  })();
}

/**
 * An Item matched to a word group no product is in any more (the group rules or Product names changed) moves to the
 * group its own name gives, keeping the measure and pack count. Valid refs, names that give no ref and Made groups stay;
 * a second run finds nothing dead to move. openDb runs it once per database (user_version 1 -> 2); call it again after
 * renaming Products in bulk.
 */
export function moveDeadGroupRefs(db: Db) {
  if (!db.$client.prepare("SELECT 1 FROM products LIMIT 1").get()) return; // an empty catalog makes every ref look dead
  const rows = db.$client.prepare("SELECT id, name, group_ref AS ref FROM items WHERE group_ref IS NOT NULL").all() as { id: string; name: string; ref: string }[];
  const move = db.$client.prepare("UPDATE items SET group_ref = ? WHERE id = ?");
  const alive = new Map<string, boolean>();
  db.$client.transaction(() => {
    for (const { id, name, ref } of rows) {
      const old = parseRef(ref); // null for a Made group
      if (!old) continue;
      if (!alive.has(ref)) alive.set(ref, groupMembers(db, ref).members.length > 0);
      if (alive.get(ref)) continue;
      const words = withoutSizes(nameWords(name).map((w) => w.norm));
      const next = words.length ? groupRef(words, old.size) : null;
      if (next && parseRef(next) && next !== ref) move.run(next, id);
    }
  })();
}

export type Db = ReturnType<typeof openDb>;
