import { asc, count, desc, eq, getTableColumns } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { chains, promotionItems, promotions, stores } from "#/db/appSchema.ts";
import type { Db } from "#/db/index.ts";
import type { AppEnv } from "#/middleware.ts";
import { PROMOTION_STATES, promotionStateAt } from "#/prices/promotions.ts";
import { bad } from "#/routes/internal/valid.ts";

const listQuery = z.object({ store: z.string().min(1).max(ID.maxLength) });
const idParam = z.object({ id: z.coerce.number().int().positive() });

const { combines: _, ...columns } = getTableColumns(promotions);

const storeOf = (db: Db, id: string) =>
  db.select({ id: stores.id, name: stores.name, chainName: chains.name }).from(stores).innerJoin(chains, eq(chains.id, stores.chainId)).where(eq(stores.id, id)).get();

const withItems = (db: Db) =>
  db
    .select({ ...columns, itemCount: count(promotionItems.code) })
    .from(promotions)
    .leftJoin(promotionItems, eq(promotionItems.promotionId, promotions.id))
    .groupBy(promotions.id);

/** The Internal dashboard's Promotions, on the private app: a store's, and one with its Products. Read-only. */
export const promotionsRoutes = new Hono<AppEnv>()
  // A store's Promotions as its newest promotion files publish them: running first, then not today, future and ended.
  .get("/", (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    const { db, clock } = c.var.deps;
    const store = storeOf(db, query.data.store);
    if (!store) return c.json({ error: "not found" }, 404);
    const state = promotionStateAt(clock.now());
    const rows = withItems(db).where(eq(promotions.storeId, store.id)).orderBy(desc(promotions.startsAt), asc(promotions.id)).all();
    const shown = rows.map((p) => ({ ...p, state: state(p) })).sort((a, b) => PROMOTION_STATES.indexOf(a.state) - PROMOTION_STATES.indexOf(b.state));
    return c.json({ store, promotions: shown }, 200);
  })
  // One Promotion, its store, and the Products it covers with their Shelf price there (null where the store has no price for it).
  .get("/:id", (c) => {
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const { db, clock } = c.var.deps;
    const promotion = withItems(db).where(eq(promotions.id, param.data.id)).get();
    if (!promotion) return c.json({ error: "not found" }, 404);
    const products = db.$client
      .prepare(
        `SELECT pi.code, p.name, pr.price FROM promotion_items pi
         LEFT JOIN products p ON p.code = pi.code LEFT JOIN prices pr ON pr.code = pi.code AND pr.store_id = ?
         WHERE pi.promotion_id = ? ORDER BY p.name IS NULL, p.name, pi.code`,
      )
      .all(promotion.storeId, promotion.id) as { code: string; name: string | null; price: number | null }[];
    return c.json({ promotion: { ...promotion, state: promotionStateAt(clock.now())(promotion) }, store: storeOf(db, promotion.storeId)!, products }, 200);
  });
