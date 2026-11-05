import { Hono } from "hono";
import { z } from "zod";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import { layout } from "#/pages/layout.ts";
import { notice, productPage, productsFound, productsPage, typeForm } from "#/pages/products.ts";

// type: "" (Any) or anything outside the list is no filter.
const searchQuery = z.object({
  q: z.string().trim().max(100).default(""),
  type: z.enum([...PRODUCT_TYPES, "none"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100).catch(1),
});
const typeBody = z.object({ productType: z.enum(PRODUCT_TYPES) });

/** Products from the private app's search and Product detail. Any answer other than 200 (or 404) is a bug: onError shows it. */
export const productsRoutes = new Hono<AppEnv>()
  .get("/products", async (c) => {
    const query = searchQuery.safeParse(c.req.query());
    if (!query.success) return c.html(layout("Products", productsPage("", undefined, notice("Searches are at most 100 characters."))), 400);
    const { q, type, page } = query.data;
    if (!q && !type) return c.html(layout("Products", productsPage(q, type)));
    if (q && q.length < SEARCH.minLength) return c.html(layout("Products", productsPage(q, type, notice(`Type at least ${SEARCH.minLength} characters.`))));
    const res = await c.var.deps.api.products.$get({ query: { ...(q && { q }), ...(type && { type }), page: String(page) } });
    if (res.status !== 200) throw new Error(`api GET /products answered ${res.status}`);
    return c.html(layout("Products", productsPage(q, type, productsFound(q, type, page, await res.json()))));
  })
  .get("/products/:code", async (c) => {
    const code = c.req.param("code");
    const res = await c.var.deps.api.products[":code"].$get({ param: { code } });
    const { status } = res;
    if (status === 404 || status === 400) return c.html(layout("Products", productsPage("", undefined, notice(`No Product with code ${code}.`))), 404);
    if (status !== 200) throw new Error(`api GET /products/:code answered ${String(status)}`);
    const detail = await res.json();
    return c.html(layout(detail.product.name, productPage(detail, await c.var.deps.productImage(code))));
  })
  // The Product type form (htmx): the private app sets it, and a Price sync never changes it. htmx swaps only a 200.
  .post("/products/:code/type", async (c) => {
    const code = c.req.param("code");
    const body = typeBody.safeParse(await c.req.parseBody().catch(() => undefined));
    if (!body.success) return c.html(notice("Choose one of the Product types."), 400);
    const res = await c.var.deps.api.products[":code"].type.$put({ param: { code }, json: body.data });
    const { status } = res;
    if (status === 404 || status === 400) return c.html(notice(`No Product with code ${code}.`), 404);
    if (status !== 200) throw new Error(`api PUT /products/:code/type answered ${String(status)}`);
    return c.html(typeForm(code, (await res.json()).productType, true));
  });
