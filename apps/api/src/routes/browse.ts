import { Hono, type Context } from "hono";
import { z } from "zod";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { requireUser, type AppEnv } from "#/middleware.ts";
import { cardsOf, groupPage, pricedProducts, typeCounts } from "#/prices/browse.ts";
import { groupRefSchema } from "#/prices/groups.ts";
import { nearbyStoreIds } from "#/prices/nearby.ts";

/** Where the User is, as Compare takes it, or nothing (location off). Both lat and lng, or neither. */
export const nearQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(50).default(10),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), "lat and lng go together");
export const typeParam = z.enum(PRODUCT_TYPES);

const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);

/** The nearby stores' ids for a parsed `nearQuery`, or null without a location (then every store counts, unpriced). */
export const storesFor = (c: Context<AppEnv>, q: z.infer<typeof nearQuery>) =>
  q.lat === undefined || q.lng === undefined ? null : nearbyStoreIds(c.var.deps.db, { lat: q.lat, lng: q.lng, radiusKm: q.radiusKm });

export const browseRoutes = new Hono<AppEnv>()
  .use(requireUser)
  // Home: the Product types sold nearby, each with its count of group cards.
  .get("/types", (c) => {
    const q = nearQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    return c.json(typeCounts(pricedProducts(c.var.deps.db, storesFor(c, q.data))));
  })
  // One Product type's group cards.
  .get("/types/:type", (c) => {
    const type = typeParam.safeParse(c.req.param("type"));
    if (!type.success) return bad(c, type.error);
    const q = nearQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    const stores = storesFor(c, q.data);
    return c.json(cardsOf(c.var.deps.db, pricedProducts(c.var.deps.db, stores, type.data), stores));
  })
  // A group card's product page: the card and its Products sold nearby, each with its cheapest nearby price.
  .get("/types/:type/groups/:ref", (c) => {
    const type = typeParam.safeParse(c.req.param("type"));
    if (!type.success) return bad(c, type.error);
    const ref = groupRefSchema.safeParse(c.req.param("ref"));
    if (!ref.success) return bad(c, ref.error);
    const q = nearQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    const stores = storesFor(c, q.data);
    const page = groupPage(c.var.deps.db, pricedProducts(c.var.deps.db, stores, type.data), stores, ref.data);
    return page ? c.json(page) : c.json({ error: "not found" }, 404);
  });
