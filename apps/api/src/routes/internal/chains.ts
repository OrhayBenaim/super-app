import { Hono } from "hono";
import type { AppEnv } from "#/middleware.ts";

type Row = {
  id: string;
  key: string;
  name: string;
  nameHe: string;
  stores: number;
  storesWithoutLocation: number;
  lastStatus: "ok" | "failed" | null;
  lastGoodSyncAt: number | null;
};

// A Chain's last outcome is its result in the newest Price sync that reached it; its last good sync is when the newest
// Price sync it was ok in started (Chain results go with their Price sync after 90 days).
const CHAINS = `
  SELECT c.id, c.key, c.name, c.name_he AS nameHe,
    (SELECT count(*) FROM stores s WHERE s.chain_id = c.id) AS stores,
    (SELECT count(*) FROM stores s WHERE s.chain_id = c.id AND (s.lat IS NULL OR s.lng IS NULL)) AS storesWithoutLocation,
    (SELECT r.status FROM sync_chain_results r WHERE r.chain_id = c.id ORDER BY r.sync_run_id DESC LIMIT 1) AS lastStatus,
    (SELECT max(sr.started_at) FROM sync_chain_results r JOIN sync_runs sr ON sr.id = r.sync_run_id
      WHERE r.chain_id = c.id AND r.status = 'ok') AS lastGoodSyncAt
  FROM chains c ORDER BY c.name`;

/** The Internal dashboard's Chains overview, on the private app. */
export const chainsRoutes = new Hono<AppEnv>()
  // Every Chain with its stores, how many have no location, its last Price sync outcome and its last good sync.
  .get("/", (c) => {
    const rows = c.var.deps.db.$client.prepare(CHAINS).all() as Row[];
    const chains = rows.map((r) => ({ ...r, lastGoodSyncAt: r.lastGoodSyncAt === null ? null : new Date(r.lastGoodSyncAt).toISOString() }));
    return c.json({ chains }, 200);
  });
