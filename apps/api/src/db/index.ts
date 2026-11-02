import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { chainSeeds } from "#/ingest/chains.ts";
import { ownGroupRef } from "#/ingest/groups.ts";
import * as schema from "#/db/schema.ts";

/** Opens the SQLite file (":memory:" in tests), applies migrations, upserts the chain seeds and links old Produce-group items. */
export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });

  for (const { ids, key, name, nameHe, orderUrl } of chainSeeds) {
    const row = { id: ids[0]!, key, name, nameHe, orderUrl };
    db.insert(schema.chains).values(row).onConflictDoUpdate({ target: schema.chains.id, set: row }).run();
  }
  linkProduceItems(sqlite);
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

export type Db = ReturnType<typeof openDb>;
