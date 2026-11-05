import { and, asc, count, eq, isNull, max, ne, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { chains, prices, stores } from "#/db/appSchema.ts";
import type { AppEnv } from "#/middleware.ts";

const PAGE_SIZE = 100;
const listQuery = z.object({
  chain: z.string().min(1).optional(),
  noLocation: z.stringbool().optional(),
  publishedDiffers: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const columns = {
  id: stores.id,
  chainId: stores.chainId,
  chainName: chains.name,
  storeId: stores.storeId,
  name: stores.name,
  address: stores.address,
  city: stores.city,
  lat: stores.lat,
  lng: stores.lng,
  publishedAddress: stores.publishedAddress,
  publishedCity: stores.publishedCity,
};

/** The Internal dashboard's stores table and map, on the private app. */
export const storesRoutes = new Hono<AppEnv>()
  // One page of the filtered stores by name, their total, and every one of them with a location for the map.
  .get("/", (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: query.error.issues[0]?.message ?? "invalid query" }, 400);
    const { chain, noLocation, publishedDiffers, page } = query.data;
    const { db } = c.var.deps;
    const filters: SQL[] = [];
    if (chain) filters.push(eq(stores.chainId, chain));
    if (noLocation) filters.push(or(isNull(stores.lat), isNull(stores.lng))!);
    if (publishedDiffers) filters.push(or(ne(stores.address, stores.publishedAddress), ne(stores.city, stores.publishedCity))!);
    const where = and(...filters);
    const rows = db
      .select(columns)
      .from(stores)
      .innerJoin(chains, eq(chains.id, stores.chainId))
      .where(where)
      .orderBy(asc(stores.name), asc(stores.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
      .all();
    const total = db.select({ n: count() }).from(stores).where(where).get()?.n ?? 0;
    const locations = db
      .select({ id: stores.id, name: stores.name, lat: stores.lat, lng: stores.lng })
      .from(stores)
      .where(where)
      .all()
      .filter((s): s is typeof s & { lat: number; lng: number } => s.lat !== null && s.lng !== null);
    return c.json({ stores: rows, total, page, pageSize: PAGE_SIZE, locations }, 200);
  })
  // One store with its price count and when its prices were last updated.
  .get("/:id", (c) => {
    const { db } = c.var.deps;
    const store = db.select(columns).from(stores).innerJoin(chains, eq(chains.id, stores.chainId)).where(eq(stores.id, c.req.param("id"))).get();
    if (!store) return c.json({ error: "not found" }, 404);
    const stats = db.select({ priceCount: count(), updatedAt: max(prices.updatedAt) }).from(prices).where(eq(prices.storeId, store.id)).get();
    return c.json({ store: { ...store, priceCount: stats?.priceCount ?? 0, pricesUpdatedAt: stats?.updatedAt ?? null } }, 200);
  });
