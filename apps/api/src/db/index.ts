import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { chainSeeds } from "#/ingest/chains.ts";
import { fillProduceGroups } from "#/ingest/ingest.ts";
import * as schema from "#/db/schema.ts";

/** Opens the SQLite file (":memory:" in tests), applies migrations, upserts the chain seeds and fills missing Produce groups. */
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
  fillProduceGroups({ db });
  return db;
}

export type Db = ReturnType<typeof openDb>;
