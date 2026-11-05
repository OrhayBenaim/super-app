import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { promotionKinds } from "#/db/appSchema.ts";
import type { Db } from "#/db/index.ts";
import type { AppEnv } from "#/middleware.ts";
import { promotionPrice, promotionStateAt, type PromotionTerms } from "#/prices/promotions.ts";
import { bad } from "#/routes/internal/valid.ts";

const PAGE_SIZE = 50;
// The list's states go by dates alone: one within its dates but not on today's weekday is running (its page says not today).
const LIST_STATES = ["running", "future", "ended"] as const;
const listQuery = z.object({
  chain: z.string().min(1).max(ID.maxLength).optional(),
  store: z.string().min(1).max(ID.maxLength).optional(),
  kind: z.enum(promotionKinds).optional(),
  state: z.enum(LIST_STATES).default("running"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

type Row = Omit<PromotionTerms, "id" | "weighted"> & {
  id: number;
  chainId: string;
  chainName: string;
  promotionId: string;
  startsAt: number;
  endsAt: number;
  days: string | null;
};

const ROW = `p.id, p.chain_id AS chainId, ch.name AS chainName, p.promotion_id AS promotionId, p.description, p.kind, p.min_qty AS minQty,
  p.amount, p.audience, p.starts_at AS startsAt, p.ends_at AS endsAt, p.days, p.limit_qty AS limitQty, p.min_purchase AS minPurchase`;
const iso = <R extends { startsAt: number; endsAt: number }>({ startsAt, endsAt, ...r }: R) => ({ ...r, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() });

/**
 * The promotions rows the filters keep, as SQL (no table alias) and its arguments. A store keeps the Promotions it
 * publishes, at every store of its Chain: looked up by Chain and PromotionID, or (`seek` false) checked row by row,
 * which is faster when the rows are already one store's.
 */
function rowFilter({ chain, store, kind }: { chain?: string; store?: string; kind?: string }, seek = true) {
  const sql = ["1"];
  const args: string[] = [];
  if (chain) sql.push("chain_id = ?"), args.push(chain);
  if (store) sql.push(`${seek ? "(chain_id, promotion_id)" : "(+chain_id, +promotion_id)"} IN (SELECT chain_id, promotion_id FROM promotions WHERE store_id = ?)`), args.push(store);
  if (kind) sql.push("kind = ?"), args.push(kind);
  return { where: sql.join(" AND "), args };
}

/** The filter's Promotions, one per Chain and PromotionID (its lowest row stands for it), from one scan of promotions_chain_promotion_idx. */
const groups = (db: Db, where: string, args: string[]) =>
  db.$client
    .prepare(`SELECT MIN(id), COUNT(*), starts_at, ends_at, kind FROM promotions WHERE ${where} GROUP BY chain_id, promotion_id`)
    .raw()
    .all(...args) as [id: number, stores: number, startsAt: number, endsAt: number, kind: string][];

/** The Internal dashboard's Promotions, on the private app: every Chain's, grouped across its stores, and one with its Products. Read-only. */
export const promotionsRoutes = new Hono<AppEnv>()
  // One page of the filter's Promotions in a state, most stores first; the count in each state; how many running ones are
  // information only and how many stores publish a running one; the Chain filtered by (a store's own) and the stores to filter by.
  .get("/", (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    const { store, state, page } = query.data;
    const { db, clock } = c.var.deps;
    const sqlite = db.$client;
    const storeChain = store === undefined ? undefined : (sqlite.prepare("SELECT chain_id FROM stores WHERE id = ?").pluck().get(store) as string | undefined);
    if (store !== undefined && storeChain === undefined) return c.json({ error: "not found" }, 404);
    const { where, args } = rowFilter(query.data);
    const now = clock.now().getTime();

    const counts = { running: 0, future: 0, ended: 0 };
    let info = 0;
    const shown: [id: number, stores: number][] = [];
    for (const [id, stores, startsAt, endsAt, kind] of groups(db, where, args)) {
      const s = startsAt > now ? "future" : endsAt <= now ? "ended" : "running";
      counts[s]++;
      if (s === "running" && kind === "info") info++;
      if (s === state) shown.push([id, stores]);
    }
    shown.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const byId = new Map(
      (
        sqlite
          .prepare(
            `SELECT ${ROW}, (SELECT COUNT(*) FROM promotion_items pi WHERE pi.promotion_id = p.id) AS products
             FROM promotions p JOIN chains ch ON ch.id = p.chain_id WHERE p.id IN (SELECT value FROM json_each(?))`,
          )
          .all(JSON.stringify(pageRows.map(([id]) => id))) as (Row & { products: number })[]
      ).map((r) => [r.id, r]),
    );
    const promotions = pageRows.map(([id, stores]) => {
      const { products, ...r } = byId.get(id)!;
      return { ...iso(r), stores, products };
    });

    const chain = storeChain ?? query.data.chain ?? null;
    // Each store's own rows: without INDEXED BY, SQLite reads the Chain's every row for each store (seconds).
    const byStore = rowFilter(query.data, false);
    const publishing = sqlite
      .prepare(
        `SELECT COUNT(*) FROM stores s WHERE (? IS NULL OR s.chain_id = ?) AND EXISTS (SELECT 1 FROM promotions INDEXED BY promotions_store_promotion_idx
           WHERE store_id = s.id AND starts_at <= ? AND ends_at > ? AND ${byStore.where})`,
      )
      .pluck()
      .get(chain, chain, now, now, ...byStore.args) as number;
    const storeOptions = sqlite
      .prepare("SELECT id, name FROM stores s WHERE (? IS NULL OR chain_id = ?) AND EXISTS (SELECT 1 FROM promotions WHERE store_id = s.id) ORDER BY name, id")
      .all(chain, chain) as { id: string; name: string }[];
    return c.json({ promotions, total: shown.length, page, pageSize: PAGE_SIZE, counts, info, stores: publishing, chain, storeOptions }, 200);
  })
  // One Promotion across the stores of its Chain that publish it: its terms (this row's), the stores, and the Products it
  // covers with their Shelf price at the cheapest of those stores and their price with it (null where none can be worked out).
  .get("/:id", (c) => {
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const { db, clock } = c.var.deps;
    const sqlite = db.$client;
    const row = sqlite.prepare(`SELECT ${ROW}, p.combines FROM promotions p JOIN chains ch ON ch.id = p.chain_id WHERE p.id = ?`).get(param.data.id) as
      | (Row & { combines: number })
      | undefined;
    if (!row) return c.json({ error: "not found" }, 404);
    const stores = sqlite
      .prepare("SELECT s.id, s.name, s.city FROM promotions p JOIN stores s ON s.id = p.store_id WHERE p.chain_id = ? AND p.promotion_id = ? ORDER BY s.name, s.id")
      .all(row.chainId, row.promotionId) as { id: string; name: string; city: string }[];
    const items = sqlite
      .prepare(
        `SELECT pi.code, pr.name, MIN(x.price) AS price FROM promotion_items pi LEFT JOIN products pr ON pr.code = pi.code
         LEFT JOIN prices x ON x.code = pi.code AND x.store_id IN (SELECT store_id FROM promotions WHERE chain_id = ? AND promotion_id = ?)
         WHERE pi.promotion_id = ? GROUP BY pi.code ORDER BY pr.name IS NULL, pr.name, pi.code`,
      )
      .all(row.chainId, row.promotionId, row.id) as { code: string; name: string | null; price: number | null }[];
    const products = items.map((p) => ({ ...p, promotion: p.price === null ? null : promotionPrice(row, p.price) }));
    const state = promotionStateAt(clock.now())({ startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt), days: row.days });
    const promotion = { ...iso(row), combines: row.combines === 1, state, stores: stores.length, products: products.length };
    return c.json({ promotion, stores, products }, 200);
  });
