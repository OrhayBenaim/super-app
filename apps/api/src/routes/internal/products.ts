import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { PRODUCT_TYPE_FILTERS, PRODUCT_TYPES } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import { imageType, MAX_IMAGE_BYTES, removeProductImage, saveProductImage } from "#/db/product-images.ts";
import type { AppEnv } from "#/middleware.ts";
import { regroupProduct } from "#/prices/browse-groups.ts";
import { findProducts, productDetail, productTypeCounts } from "#/prices/products.ts";
import { bad, jsonBody } from "#/routes/internal/valid.ts";

// type: a Product type, or "none" for Products with none yet. Without q, every priced Product (of that type).
const searchQuery = z
  .object({
    q: z.string().trim().min(SEARCH.minLength).max(SEARCH.maxLength).optional(),
    type: z.enum(PRODUCT_TYPE_FILTERS).optional(),
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  });
const codeParam = z.object({ code: z.string().trim().min(1).max(ID.maxLength) });
const typeBody = z.object({ productType: z.enum(PRODUCT_TYPES) });
const imageForm = z.object({ image: z.instanceof(File, { message: "Choose an image." }) });
const tooLarge = { error: "The image must be at most 5 MB." };
const isProduct = (c: { var: AppEnv["Variables"] }, code: string) =>
  !!c.var.deps.db.$client.prepare("SELECT 1 FROM products WHERE code = ?").get(code);

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
  .get("/types", (c) => c.json(productTypeCounts(c.var.deps.db), 200))
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
  })
  // The team's Product image (docs/adr/0008), multipart field "image": it wins over the barcode lookup everywhere.
  .put(
    "/:code/image",
    bodyLimit({ maxSize: MAX_IMAGE_BYTES + 64 * 1024, onError: (c) => c.json(tooLarge, 413) }), // room for the form around it
    validator("form", (value, c) => {
      const form = imageForm.safeParse(value);
      return form.success ? form.data : bad(c, form.error);
    }),
    async (c) => {
      const param = codeParam.safeParse(c.req.param());
      if (!param.success) return bad(c, param.error);
      const { code } = param.data;
      const { image } = c.req.valid("form");
      if (image.size > MAX_IMAGE_BYTES) return c.json(tooLarge, 413);
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (!imageType(bytes)) return c.json({ error: "The image must be a PNG, JPEG or WebP." }, 400);
      if (!isProduct(c, code)) return c.json({ error: "not found" }, 404);
      await saveProductImage(c.var.deps.imagesDir, code, bytes);
      return c.json({ code }, 200);
    },
  )
  // Back to the image found by barcode.
  .delete("/:code/image", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const removed = await removeProductImage(c.var.deps.imagesDir, param.data.code);
    return removed ? c.json({ code: param.data.code }, 200) : c.json({ error: "not found" }, 404);
  });
