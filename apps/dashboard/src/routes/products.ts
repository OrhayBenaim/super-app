import { Hono } from "hono";
import { z } from "zod";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import { layout } from "#/pages/layout.ts";
import { notice, productPage, productsFound, productsPage } from "#/pages/products.ts";

const searchQuery = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100).catch(1),
});

/** Products from the private app's search and Product detail. Any answer other than 200 (or 404) is a bug: onError shows it. */
export const productsRoutes = new Hono<AppEnv>()
  .get("/products", async (c) => {
    const query = searchQuery.safeParse(c.req.query());
    if (!query.success) return c.html(layout("Products", productsPage("", notice("Searches are at most 100 characters."))), 400);
    const { q, page } = query.data;
    if (!q) return c.html(layout("Products", productsPage(q)));
    if (q.length < SEARCH.minLength) return c.html(layout("Products", productsPage(q, notice(`Type at least ${SEARCH.minLength} characters.`))));
    const res = await c.var.deps.api.products.$get({ query: { q, page: String(page) } });
    if (res.status !== 200) throw new Error(`api GET /products answered ${res.status}`);
    return c.html(layout("Products", productsPage(q, productsFound(q, page, await res.json()))));
  })
  .get("/products/:code", async (c) => {
    const code = c.req.param("code");
    const res = await c.var.deps.api.products[":code"].$get({ param: { code } });
    const { status } = res;
    if (status === 404 || status === 400) return c.html(layout("Products", productsPage("", notice(`No Product with code ${code}.`))), 404);
    if (status !== 200) throw new Error(`api GET /products/:code answered ${String(status)}`);
    const detail = await res.json();
    return c.html(layout(detail.product.name, productPage(detail, await c.var.deps.productImage(code))));
  });
