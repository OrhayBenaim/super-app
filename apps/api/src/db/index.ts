import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

const path = process.env.DATABASE_URL ?? "./data/grocer.db";
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Resolves to apps/api/drizzle from both src/db and dist/db.
migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
