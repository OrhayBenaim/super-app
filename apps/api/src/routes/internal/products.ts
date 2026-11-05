import { Hono } from "hono";
import { z } from "zod";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import { regroupProduct } from "#/prices/browse-groups.ts";
import { findProducts, productDetail } from "#/prices/products.ts";
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

/**
 * The Internal dashboard's Products, on the private app: the public search and Compare's price rules, and setting a
 * Product's type (the Product type step only types untyped Products, so a Price sync never changes it).
 */
export const productsRoutes = new Hono<AppEnv>()
  // The app's search, its Products only (not its Product groups), a page at a time, with each Product's type.
  .get("/", (c) => {
    const query = searchQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    return c.json(findProducts(c.var.deps.db, query.data), 200);
  })
  // One Product, its Shelf price at every store that prices it (cheapest first) and the Promotions running there now.
  .get("/:code", (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const detail = productDetail(c.var.deps.db, param.data.code, c.var.deps.clock.now());
    return detail ? c.json(detail, 200) : c.json({ error: "not found" }, 404);
  })
  .put("/:code/type", jsonBody(typeBody), (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const { code } = param.data;
    const { productType } = c.req.valid("json");
    const { changes } = c.var.deps.db.$client.prepare("UPDATE products SET product_type = ? WHERE code = ?").run(productType, code);
    if (changes === 0) return c.json({ error: "not found" }, 404);
    regroupProduct(c.var.deps.db, code); // Home shows it now, not after the next Price sync
    return c.json({ code, productType }, 200);
  });
