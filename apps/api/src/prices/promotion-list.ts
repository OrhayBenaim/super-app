// The Internal dashboard's Promotion reads: every Chain's Promotions grouped across its stores, one Promotion, and a
// store's running count. States are promotionStateAt's and deal texts promotionText's, as Compare and the Product page.
import type { PromotionKind } from "#/db/appSchema.ts";
import type { Db } from "#/db/index.ts";
import { promotionPrice, promotionStateAt, promotionText, type PromotionState, type PromotionTerms } from "#/prices/promotions.ts";

const PAGE_SIZE = 50;
/** The list's chips: a Promotion within its dates but not on today's weekday is listed under running (its row says not today). */
export const LIST_STATES = ["running", "future", "ended"] as const;
export type ListState = (typeof LIST_STATES)[number];
const listStateOf = (s: PromotionState): ListState => (s === "notToday" ? "running" : s);

export type ListFilter = { chain?: string; store?: string; kind?: PromotionKind; state: ListState; page: number };

type Row = Omit<PromotionTerms, "id"> & {
  id: number;
  chainId: string;
  chainName: string;
  promotionId: string;
  startsAt: number;
  endsAt: number;
  days: string | null;
};

// weighted: its Products are weighed, so its text reads in kilos as on their pages.
const ROW = `p.id, p.chain_id AS chainId, ch.name AS chainName, p.promotion_id AS promotionId, p.description, p.kind, p.min_qty AS minQty,
  p.amount, p.audience, p.starts_at AS startsAt, p.ends_at AS endsAt, p.days, p.limit_qty AS limitQty, p.min_purchase AS minPurchase,
  EXISTS (SELECT 1 FROM promotion_items wi JOIN products wp ON wp.code = wi.code WHERE wi.promotion_id = p.id AND wp.is_weighted) AS weighted`;

/** A row as the dashboard reads it: ISO dates, its state at `now` and its deal text. */
const shown = (now: Date) => {
  const stateOf = promotionStateAt(now);
  return <R extends Row>({ startsAt, endsAt, weighted, ...r }: R) => ({
    ...r,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    state: stateOf({ startsAt: new Date(startsAt), endsAt: new Date(endsAt), days: r.days }),
    deal: promotionText({ ...r, id: r.promotionId, weighted }),
  });
};

/**
 * The promotions rows the filters keep, as SQL (no table alias) and its arguments. A store keeps the Promotions it
 * publishes, at every store of its Chain: looked up by Chain and PromotionID, or (`seek` false) checked row by row,
 * which is faster when the rows are already one store's.
 */
function rowFilter({ chain, store, kind }: Omit<ListFilter, "state" | "page">, seek = true) {
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
    .prepare(`SELECT MIN(id), COUNT(*), starts_at, ends_at, days, kind FROM promotions WHERE ${where} GROUP BY chain_id, promotion_id`)
    .raw()
    .all(...args) as [id: number, stores: number, startsAt: number, endsAt: number, days: string | null, kind: string][];

/**
 * One page of the filter's Promotions in a state, most stores first; the count in each state; how many running ones are
 * information only and how many stores publish a running one; the Chain filtered by (a store's own) and the stores to
 * filter by. Null when the store is not one.
 */
export function promotionList(db: Db, filter: ListFilter, now: Date) {
  const { store, state, page } = filter;
  const sqlite = db.$client;
  const storeChain = store === undefined ? undefined : (sqlite.prepare("SELECT chain_id FROM stores WHERE id = ?").pluck().get(store) as string | undefined);
  if (store !== undefined && storeChain === undefined) return null;
  const { where, args } = rowFilter(filter);
  const stateOf = promotionStateAt(now);

  const counts = { running: 0, future: 0, ended: 0 };
  let info = 0;
  const listed: [id: number, stores: number][] = [];
  for (const [id, stores, startsAt, endsAt, days, kind] of groups(db, where, args)) {
    const s = listStateOf(stateOf({ startsAt: new Date(startsAt), endsAt: new Date(endsAt), days }));
    counts[s]++;
    if (s === "running" && kind === "info") info++;
    if (s === state) listed.push([id, stores]);
  }
  listed.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const pageRows = listed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
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
  const show = shown(now);
  const promotions = pageRows.map(([id, stores]) => {
    const { products, ...r } = byId.get(id)!;
    return { ...show(r), stores, products };
  });

  const chain = storeChain ?? filter.chain ?? null;
  // Each store's own rows: without INDEXED BY, SQLite reads the Chain's every row for each store (seconds). Within its
  // dates is the running chip's rule (listStateOf), in SQL.
  const byStore = rowFilter(filter, false);
  const t = now.getTime();
  const publishing = sqlite
    .prepare(
      `SELECT COUNT(*) FROM stores s WHERE (? IS NULL OR s.chain_id = ?) AND EXISTS (SELECT 1 FROM promotions INDEXED BY promotions_store_promotion_idx
         WHERE store_id = s.id AND starts_at <= ? AND ends_at > ? AND ${byStore.where})`,
    )
    .pluck()
    .get(chain, chain, t, t, ...byStore.args) as number;
  const storeOptions = sqlite
    .prepare("SELECT id, name FROM stores s WHERE (? IS NULL OR chain_id = ?) AND EXISTS (SELECT 1 FROM promotions WHERE store_id = s.id) ORDER BY name, id")
    .all(chain, chain) as { id: string; name: string }[];
  return { promotions, total: listed.length, page, pageSize: PAGE_SIZE, counts, info, stores: publishing, chain, storeOptions };
}

/**
 * One Promotion across the stores of its Chain that publish it: its terms (this row's), the stores, and the Products it
 * covers with their Shelf price at the cheapest of those stores and their price with it (null where none can be worked
 * out). Null when there is no such row.
 */
export function promotionDetail(db: Db, id: number, now: Date) {
  const sqlite = db.$client;
  const row = sqlite.prepare(`SELECT ${ROW}, p.combines FROM promotions p JOIN chains ch ON ch.id = p.chain_id WHERE p.id = ?`).get(id) as
    | (Row & { combines: number })
    | undefined;
  if (!row) return null;
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
  const promotion = { ...shown(now)(row), combines: row.combines === 1, stores: stores.length, products: products.length };
  return { promotion, stores, products };
}

/** How many Promotions a store publishes that its Promotions link opens on: the list's running ones. */
export function runningPromotionCount(db: Db, storeId: string, now: Date) {
  const stateOf = promotionStateAt(now);
  const rows = db.$client.prepare("SELECT starts_at AS startsAt, ends_at AS endsAt, days FROM promotions WHERE store_id = ?").all(storeId) as {
    startsAt: number;
    endsAt: number;
    days: string | null;
  }[];
  return rows.filter((r) => listStateOf(stateOf({ startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt), days: r.days })) === "running").length;
}
