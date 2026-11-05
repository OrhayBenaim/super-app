import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { PRODUCT_TYPE_FILTERS, PRODUCT_TYPES } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import { found, unexpected } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { layout, notFound, notice, type Html } from "#/pages/layout.ts";
import { PAGE_SIZE, productCards, productPage, productsPage, thumbnail, typeForm, type TypeFilter } from "#/pages/products.ts";

// type: "" (Any) or anything outside the list is no filter.
const searchQuery = z.object({
  q: z.string().trim().max(SEARCH.maxLength).default(""),
  type: z.enum(PRODUCT_TYPE_FILTERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100).catch(1),
});
const typeBody = z.object({ productType: z.enum(PRODUCT_TYPES) });
// As the private app's: a code it would refuse names no Product.
const codeParam = z.object({ code: z.string().trim().min(1).max(ID.maxLength) });

/** Products by Product type, the private app's search and Product detail. Any answer other than 200 (or 404) is a bug: onError shows it. */
export const productsRoutes = new Hono<AppEnv>()
  .get("/products", async (c) => {
    const { api } = c.var.deps;
    const counted = await api.products.types.$get();
    if (counted.status !== 200) throw unexpected(counted, "GET /products/types");
    const counts = await counted.json();
    const page = (q: string, type: TypeFilter, found: Html) => layout("Products", productsPage(counts, q, type, found), "products");
    const query = searchQuery.safeParse(c.req.query());
    if (!query.success) return c.html(page("", undefined, notice(`Searches are at most ${SEARCH.maxLength} characters.`)), 400);
    const { q, type, page: n } = query.data;
    if (q && q.length < SEARCH.minLength) return c.html(page(q, type, notice(`Type at least ${SEARCH.minLength} characters.`)));
    const res = await api.products.$get({ query: { ...(q && { q }), ...(type && { type }), page: String(n), pageSize: String(PAGE_SIZE) } });
    if (res.status !== 200) throw unexpected(res, "GET /products");
    return c.html(page(q, type, productCards(q, type, n, await res.json(), type ? counts.types[type] : counts.total)));
  })
  .get("/products/:code", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    const missing = () => c.html(notFound("No Product with this code."), 404);
    if (!param.success) return missing();
    const { code } = param.data;
    const detail = await found(await c.var.deps.api.products[":code"].$get({ param: { code } }), "GET /products/:code");
    if (!detail) return missing();
    return c.html(layout(detail.product.name, productPage(detail, await c.var.deps.productImage(code), c.var.deps.now()), "products"));
  })
  // A list's image cell (htmx, on reveal): the one Product image lookup.
  .get("/products/:code/image", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    return c.html(thumbnail(param.success ? await c.var.deps.productImage(param.data.code) : null));
  })
  // The Product type form (htmx): the private app sets it, and a Price sync never changes it. htmx swaps only a 2xx, so
  // a refusal is a 200 too (as the Manual sync button's).
  .post("/products/:code/type", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return c.html(notice("No Product with this code."));
    const { code } = param.data;
    const body = typeBody.safeParse(await c.req.parseBody().catch(() => undefined));
    if (!body.success) return c.html(notice("Choose one of the Product types."));
    const res = await c.var.deps.api.products[":code"].type.$put({ param: { code }, json: body.data });
    if (res.status === 404) return c.html(notice("No Product with this code."));
    if (res.status === 400) return c.html(notice((await res.json()).error));
    if (res.status !== 200) throw unexpected(res, "PUT /products/:code/type");
    return c.html(typeForm(code, (await res.json()).productType, true));
  });
