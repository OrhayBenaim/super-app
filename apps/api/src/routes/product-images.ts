import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { listProductImages, readProductImage } from "#/db/product-images.ts";
import type { AppEnv } from "#/middleware.ts";

const codeParam = z.object({ code: z.string().min(1).max(ID.maxLength) });

/**
 * The uploaded Product images (docs/adr/0008), with no sign-in: the app shows them by URL. Mounted at /api/products, and
 * on the private app at /products for the Internal dashboard; uploads and removals are the private app's only.
 */
export const productImagesRoutes = new Hono<AppEnv>()
  // The codes with an uploaded image, each with a version that changes on every upload (the image URL carries it).
  .get("/images", async (c) => c.json({ images: await listProductImages(c.var.deps.imagesDir) }, 200))
  .get("/:code/image", async (c) => {
    const param = codeParam.safeParse(c.req.param());
    if (!param.success) return c.json({ error: "invalid code" }, 400);
    const image = await readProductImage(c.var.deps.imagesDir, param.data.code);
    if (!image) return c.json({ error: "not found" }, 404);
    // A new upload comes with a new version in the URL, so a day's caching never shows an old image.
    return c.body(image.bytes, 200, { "Content-Type": image.type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" });
  });
