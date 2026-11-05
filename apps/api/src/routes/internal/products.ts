import { Hono } from "hono";
import { z } from "zod";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import { measureOf, soldByOf } from "#/prices/groups.ts";
import { promotionText, runningPromotions } from "#/prices/promotions.ts";
import { searchProducts } from "#/prices/search.ts";
import { bad, jsonBody } from "#/routes/internal/valid.ts";

// type: a Product type, or "none" for Products with none yet. Without q, every priced Product of that type.
const searchQuery = z
  .object({
    q: z.string().trim().min(SEARCH.minLength).max(100).optional(),
    type: z.enum([...PRODUCT_TYPES, "none"]).optional(),
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((query) => query.q !== undefined || query.type !== undefined, "q or type required");
const codeParam = z.object({ code: z.string().trim().min(1).max(64) });
const typeBody = z.object({ productType: z.enum(PRODUCT_TYPES) });

type Product = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; productType: string | null };
type Listed = Omit<Product, "productType"> & { productType: string | null; storeCount: number; minPrice: number };
// Mirrors the search's columns; the price lookups are per Product, like the search's.
const BY_TYPE = `SELECT code, name, manufacturer, unit_qty AS unitQty, is_weighted AS isWeighted, product_type AS productType,
     (SELECT count(*) FROM prices pr WHERE pr.code = p.code) AS storeCount, (SELECT min(price) FROM prices pr WHERE pr.code = p.code) AS minPrice
   FROM products p WHERE product_type IS @type AND storeCount > 0 ORDER BY storeCount DESC, code LIMIT @limit OFFSET @offset`;
// shortcut: a typed search filters the search's first 3000 Products (its own candidate cap); raise both together.
const TYPED_SEARCH_LIMIT = 3000;

type PriceRow = { storeId: string; storeName: string; city: string; chainId: string; chainName: string; chainNameHe: string; price: number; updatedAt: number };

/**
 * The Internal dashboard's Products, on the private app: the public search and Compare's price rules, and setting a
 * Product's type (the Product type step only types untyped Products, so a Price sync never changes it).
 */
export const productsRoutes = new Hono<AppEnv>()
  // The app's search, its Products only (not its Product groups), a page at a time, with each Product's type.
  .get("/", (c) => {
    const query = searchQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    const { q, type, page, pageSize } = query.data;
    const { db } = c.var.deps;
    const wanted = type === "none" ? null : type;
    if (q === undefined) {
      const rows = db.$client.prepare(BY_TYPE).all({ type: wanted, limit: pageSize + 1, offset: (page - 1) * pageSize }) as Listed[];
      const products = rows.slice(0, pageSize).map(({ isWeighted, ...p }) => ({
        ...p,
        ...(measureOf({ ...p, isWeighted }) ?? { measure: null, size: null }),
        soldBy: soldByOf({ ...p, isWeighted }),
      }));
      return c.json({ products, hasMore: rows.length > pageSize }, 200);
    }
    const searched = searchProducts(db, q, type ? TYPED_SEARCH_LIMIT : page * pageSize + 1).filter((r) => r.kind === "product");
    const types = new Map(
      (db.$client.prepare("SELECT code, product_type AS t FROM products WHERE code IN (SELECT value FROM json_each(?))").all(JSON.stringify(searched.map((p) => p.code))) as { code: string; t: string | null }[]).map((r) => [r.code, r.t]),
    );
    const found = searched.map(({ kind: _, ...p }) => ({ ...p, productType: types.get(p.code) ?? null })).filter((p) => !type || p.productType === wanted);
    return c.json({ products: found.slice((page - 1) * pageSize, page * pageSize), hasMore: found.length > page * pageSize }, 200);
  })
  // One Product, its Shelf price at every store that prices it (cheapest first) and the Promotions running there now.
  .get("/:code", (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
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
  })
  .put(
    "/:code/type",
    jsonBody(typeBody),
    (c) => {
      const param = codeParam.safeParse(c.req.param());
      if (!param.success) return bad(c, param.error);
      const { code } = param.data;
      const { productType } = c.req.valid("json");
      const { changes } = c.var.deps.db.$client.prepare("UPDATE products SET product_type = ? WHERE code = ?").run(productType, code);
      if (changes === 0) return c.json({ error: "not found" }, 404);
      return c.json({ code, productType }, 200);
    },
  );
