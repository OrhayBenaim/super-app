import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { chainSeeds } from "#/ingest/chains.ts";
import { groupMembers, groupRef, groupWords, ownGroupRef, parseRef } from "#/prices/groups.ts";
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
  // 3, not 2: version 3 also moves the team's group edits, so a database left at 2 runs it once more.
  if ((sqlite.pragma("user_version", { simple: true }) as number) < 3) {
    moveDeadGroupRefs(db);
    sqlite.pragma("user_version = 3");
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
 * A word group no product is in any more (the group rules or Product names changed) hands what points at it to the
 * live group a name gives at the same measure and pack count: each Item moves by its own name, and the team's edits
 * (display name, added and removed Products) by the display name they gave it, unless that group has edits of its own.
 * Valid refs, Made groups, edits with no display name, and names that give no live group stay; a second run finds
 * nothing to move. openDb runs it once per database (user_version -> 3); call it again after renaming Products in bulk.
 */
export function moveDeadGroupRefs(db: Db) {
  const sqlite = db.$client;
  if (!sqlite.prepare("SELECT 1 FROM products LIMIT 1").get()) return; // an empty catalog makes every ref look dead
  const alive = new Map<string, boolean>();
  const isAlive = (ref: string) => alive.get(ref) ?? alive.set(ref, groupMembers(db, ref).members.length > 0).get(ref)!;
  /** The live group `name` gives at a dead `ref`'s size, or null when `ref` is live, a Made group, or no live group fits. */
  const heir = (ref: string, name: string) => {
    const old = parseRef(ref); // null for a Made group
    if (!old || isAlive(ref)) return null;
    const words = groupWords(name);
    const next = words.length ? groupRef(words, old.size) : null;
    return next && next !== ref && parseRef(next) && isAlive(next) ? next : null;
  };
  const items = sqlite.prepare("SELECT id, name, group_ref AS ref FROM items WHERE group_ref IS NOT NULL").all() as { id: string; name: string; ref: string }[];
  const named = sqlite.prepare("SELECT ref, name FROM group_names").all() as { ref: string; name: string }[];
  const edited = new Set(sqlite.prepare("SELECT ref FROM group_names UNION SELECT ref FROM group_products").pluck().all() as string[]);
  const moveItem = sqlite.prepare("UPDATE items SET group_ref = ? WHERE id = ?");
  const moveName = sqlite.prepare("UPDATE group_names SET ref = ? WHERE ref = ?");
  const moveMembers = sqlite.prepare("UPDATE group_products SET ref = ? WHERE ref = ?");
  sqlite.transaction(() => {
    for (const { id, name, ref } of items) {
      const next = heir(ref, name);
      if (next) moveItem.run(next, id);
    }
    for (const { ref, name } of named) {
      const next = heir(ref, name);
      if (!next || edited.has(next)) continue; // the live group's own edits win
      moveName.run(next, ref);
      moveMembers.run(next, ref);
      edited.add(next);
    }
  })();
}

export type Db = ReturnType<typeof openDb>;
