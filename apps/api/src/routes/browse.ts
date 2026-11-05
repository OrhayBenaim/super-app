import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { requireUser, type AppEnv } from "#/middleware.ts";
import { groupPage, promotionCards, promotionPage, typeCards, typeCounts } from "#/prices/browse.ts";
import { groupRefSchema } from "#/prices/groups.ts";
import { nearbyStoreIds } from "#/prices/nearby.ts";

/** Where the User is, as Compare takes it, or nothing (location off). Both lat and lng, or neither. */
const nearQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(50).default(10),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), "lat and lng go together");
const typeParam = z.enum(PRODUCT_TYPES);
/** Promotions' filters: a Product type and a Chain (its id, as GET /api/chains lists it). */
const promotionsQuery = z.object({ type: typeParam.optional(), chain: z.string().regex(/^\d{1,20}$/, "invalid chain").optional() });

/** `input` parsed by `schema`, or a 400 with the first issue's message (thrown: onError returns it). */
function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new HTTPException(400, { res: Response.json({ error: result.error.issues[0]?.message ?? "invalid request" }, { status: 400 }) });
}

/** The nearby stores' ids for the request's location, or null without one (then every store counts, unpriced). */
function storesFor(c: Context<AppEnv>) {
  const q = parse(nearQuery, c.req.query());
  return q.lat === undefined || q.lng === undefined ? null : nearbyStoreIds(c.var.deps.db, { lat: q.lat, lng: q.lng, radiusKm: q.radiusKm });
}

export const browseRoutes = new Hono<AppEnv>()
  .use(requireUser)
  // Home: the Product types sold nearby, each with its count of group cards.
  .get("/types", (c) => c.json(typeCounts(c.var.deps.db, storesFor(c))))
  // One Product type's group cards.
  .get("/types/:type", (c) => {
    const type = parse(typeParam, c.req.param("type"));
    return c.json(typeCards(c.var.deps.db, storesFor(c), type));
  })
  // A group card's product page: the card and its Products sold nearby, each with its cheapest nearby price.
  .get("/types/:type/groups/:ref", (c) => {
    const type = parse(typeParam, c.req.param("type"));
    const ref = parse(groupRefSchema, c.req.param("ref"));
    const page = groupPage(c.var.deps.db, storesFor(c), type, ref);
    return page ? c.json(page) : c.json({ error: "not found" }, 404);
  })
  // Promotions: group cards of the Products on a Promotion running nearby; nothing without a location.
  .get("/promotions", (c) => {
    const stores = storesFor(c);
    const filters = parse(promotionsQuery, c.req.query());
    return c.json(stores ? promotionCards(c.var.deps.db, stores, c.var.deps.clock.now(), filters) : []);
  })
  // A Promotions card's product page: its Products on a Promotion running nearby, each broken down by Chain.
  .get("/promotions/types/:type/groups/:ref", (c) => {
    const type = parse(typeParam, c.req.param("type"));
    const ref = parse(groupRefSchema, c.req.param("ref"));
    const stores = storesFor(c);
    const page = stores && promotionPage(c.var.deps.db, stores, c.var.deps.clock.now(), type, ref);
    return page ? c.json(page) : c.json({ error: "not found" }, 404);
  });
