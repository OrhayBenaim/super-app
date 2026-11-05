import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { html } from "hono/html";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB, type UploadedImages } from "@grocer/shared/product-image";
import { PRODUCT_TYPE_FILTERS, PRODUCT_TYPES } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import { found, unexpected, type ApiClient } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { imageOf } from "#/pages/product-image.ts";
import { layout, notFound, notice, type Html } from "#/pages/layout.ts";
import { PAGE_SIZE, productCards, productPage, productsPage, thumbnail, typeForm, type TypeFilter } from "#/pages/products.ts";
import { storesFound } from "#/pages/stores.ts";

// type: "" (Any) or anything outside the list is no filter.
const searchQuery = z.object({
  q: z.string().trim().max(SEARCH.maxLength).default(""),
  type: z.enum(PRODUCT_TYPE_FILTERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100).catch(1),
});
const typeBody = z.object({ productType: z.enum(PRODUCT_TYPES) });
// As the private app's: a code it would refuse names no Product.
const codeParam = z.object({ code: z.string().trim().min(1).max(ID.maxLength) });

/** The uploaded Product images (docs/adr/0008), served to the browser by this dashboard's /api/products/:code/image. */
async function fetchUploadedImages(api: ApiClient): Promise<UploadedImages> {
  const res = await api.products.images.$get();
  if (res.status !== 200) throw unexpected(res, "GET /products/images");
  return { base: "/api", versions: (await res.json()).images };
}
// A page's thumbnails share one answer for 30 seconds. Only this dashboard uploads or removes images, and it drops the
// answer when it does, so an upload still shows at once.
const UPLOADED_FOR_MS = 30_000;
const uploaded = new WeakMap<ApiClient, { at: number; images: Promise<UploadedImages> }>();
function uploadedImages(api: ApiClient) {
  const cached = uploaded.get(api);
  if (cached && Date.now() - cached.at < UPLOADED_FOR_MS) return cached.images;
  const images = fetchUploadedImages(api);
  images.catch(() => uploaded.get(api)?.images === images && uploaded.delete(api));
  uploaded.set(api, { at: Date.now(), images });
  return images;
}
// The private app checks the image's size; this limit only stops a far larger body before it is read.
const tooLarge = `The image must be at most ${MAX_IMAGE_MB} MB.`;
const refresh = { "HX-Refresh": "true" }; // the page shows the new image

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
    const cards = productCards(q, type, n, await res.json(), type ? counts.types[type] : counts.total);
    // The top bar's find field (no type) finds stores by name too, above the Products; the type filter narrows Products only.
    const storesRes = q && !type && n === 1 ? await api.stores.$get({ query: { q } }) : null;
    if (storesRes && storesRes.status !== 200) throw unexpected(storesRes, "GET /stores");
    return c.html(page(q, type, html`${storesRes ? storesFound(await storesRes.json()) : ""}${cards}`));
  })
  .get("/products/:code", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    const missing = () => c.html(notFound("No Product with this code."), 404);
    if (!param.success) return missing();
    const { code } = param.data;
    const detail = await found(await c.var.deps.api.products[":code"].$get({ param: { code } }), "GET /products/:code");
    if (!detail) return missing();
    const images = await uploadedImages(c.var.deps.api);
    const image = imageOf(code, await c.var.deps.productImage(code, images), images);
    return c.html(layout(detail.product.name, productPage(detail, image, c.var.deps.now()), "products"));
  })
  // A list's image cell (htmx, on reveal): the one Product image lookup.
  .get("/products/:code/image", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return c.html(thumbnail(null));
    return c.html(thumbnail(await c.var.deps.productImage(param.data.code, await uploadedImages(c.var.deps.api))));
  })
  // A7b's Use the new image (htmx, multipart "image"): the private app checks and stores it. A refusal is a 200 notice.
  .post("/products/:code/image", bodyLimit({ maxSize: MAX_IMAGE_BYTES + 64 * 1024, onError: (c) => c.html(notice(tooLarge)) }), async (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return c.html(notice("No Product with this code."));
    const { image } = await c.req.parseBody();
    if (!(image instanceof File)) return c.html(notice("Choose an image."));
    const res = await c.var.deps.api.products[":code"].image.$put({ param: { code: param.data.code }, form: { image } });
    uploaded.delete(c.var.deps.api);
    if (res.status === 404) return c.html(notice("No Product with this code."));
    if (res.status === 400 || res.status === 413) return c.html(notice((await res.json()).error));
    if (res.status !== 200) throw unexpected(res, "PUT /products/:code/image");
    return c.html("", 200, refresh);
  })
  // A7b's Remove my image: back to the one found by barcode. Already gone (404) shows the page as it is now too.
  .delete("/products/:code/image", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return c.html(notice("No Product with this code."));
    const res = await c.var.deps.api.products[":code"].image.$delete({ param: { code: param.data.code } });
    uploaded.delete(c.var.deps.api);
    if (res.status !== 200 && res.status !== 404) throw unexpected(res, "DELETE /products/:code/image");
    return c.html("", 200, refresh);
  })
  // An uploaded image's bytes, from the private app: the browser reaches the dashboard, not the api.
  .get("/api/products/:code/image", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return c.notFound();
    const res = await c.var.deps.api.products[":code"].image.$get({ param: { code: param.data.code } });
    if (res.status === 404) return c.notFound();
    if (res.status !== 200) throw unexpected(res, "GET /products/:code/image");
    return c.body(await res.arrayBuffer(), 200, { "Content-Type": res.headers.get("Content-Type")!, "Cache-Control": res.headers.get("Cache-Control")!, "X-Content-Type-Options": "nosniff" });
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
