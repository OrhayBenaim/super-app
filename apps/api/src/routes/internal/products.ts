import { Hono } from "hono";
import { z } from "zod";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import { measureOf, soldByOf } from "#/prices/groups.ts";
import { promotionText, runningPromotions } from "#/prices/promotions.ts";
import { searchProducts } from "#/routes/prices.ts";

const searchQuery = z.object({
  q: z.string().trim().min(SEARCH.minLength).max(100),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const codeParam = z.object({ code: z.string().trim().min(1).max(64) });

type Product = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; productType: string | null };
type PriceRow = { storeId: string; storeName: string; city: string; chainId: string; chainName: string; chainNameHe: string; price: number; updatedAt: number };

/** The Internal dashboard's Products, on the private app: the public search and Compare's price rules, read-only. */
export const productsRoutes = new Hono<AppEnv>()
  // The app's search, its Products only (not its Product groups), a page at a time, with each Product's type.
  .get("/", (c) => {
    const query = searchQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: query.error.issues[0]?.message ?? "invalid query" }, 400);
    const { q, page, pageSize } = query.data;
    const { db } = c.var.deps;
    const found = searchProducts(db, q, page * pageSize + 1).filter((r) => r.kind === "product");
    const shown = found.slice((page - 1) * pageSize, page * pageSize);
    const types = new Map(
      (db.$client.prepare("SELECT code, product_type AS t FROM products WHERE code IN (SELECT value FROM json_each(?))").all(JSON.stringify(shown.map((p) => p.code))) as { code: string; t: string | null }[]).map((r) => [r.code, r.t]),
    );
    const products = shown.map(({ kind: _, ...p }) => ({ ...p, productType: types.get(p.code) ?? null }));
    return c.json({ products, hasMore: found.length > page * pageSize }, 200);
  })
  // One Product, its Shelf price at every store that prices it (cheapest first) and the Promotions running there now.
  .get("/:code", (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return c.json({ error: param.error.issues[0]?.message ?? "invalid code" }, 400);
    const { code } = param.data;
    const { db, clock } = c.var.deps;
    const sqlite = db.$client;
    const p = sqlite
      .prepare("SELECT code, name, manufacturer, unit_qty AS unitQty, is_weighted AS isWeighted, product_type AS productType FROM products WHERE code = ?")
      .get(code) as Product | undefined;
    if (!p) return c.json({ error: "not found" }, 404);
    const rows = sqlite
      .prepare(
        `SELECT s.id AS storeId, s.name AS storeName, s.city, ch.id AS chainId, ch.name AS chainName, ch.name_he AS chainNameHe, pr.price, pr.updated_at AS updatedAt
         FROM prices pr JOIN stores s ON s.id = pr.store_id JOIN chains ch ON ch.id = s.chain_id
         WHERE pr.code = ? ORDER BY pr.price, ch.name, s.name`,
      )
      .all(code) as PriceRow[];
    const running = runningPromotions(db, rows.map((r) => r.storeId), [code], clock.now());
    const { isWeighted, ...product } = p;
    return c.json(
      {
        product: { ...product, ...(measureOf(p) ?? { measure: null, size: null }), soldBy: soldByOf(p) },
        prices: rows.map((r) => ({
          ...r,
          updatedAt: new Date(r.updatedAt).toISOString(),
          promotions: (running.get(`${r.storeId} ${code}`) ?? []).map(({ storeId: _s, code: _c, weighted: _w, ...promo }) => ({
            ...promo,
            text: promotionText({ ...promo, weighted: isWeighted ? 1 : 0 }, r.price),
          })),
        })),
      },
      200,
    );
  });
