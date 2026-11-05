import { and, asc, count, eq, isNull, max, ne, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { chains, prices, stores } from "#/db/appSchema.ts";
import type { AppEnv } from "#/middleware.ts";
import { bad, jsonBody } from "#/routes/internal/valid.ts";

const PAGE_SIZE = 100;
const idParam = z.object({ id: z.string().min(1).max(ID.maxLength) });
const listQuery = z.object({
  chain: z.string().min(1).max(ID.maxLength).optional(),
  noLocation: z.stringbool().optional(),
  publishedDiffers: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

// A box around Israel; a looser fence than a border, enough to catch a swapped or mistyped coordinate.
const ISRAEL = { lat: [29.4, 33.4], lng: [34.2, 35.95] } as const;
const coordinate = z.number({ error: "Latitude and longitude must be numbers." }).nullable();
const text = (field: string, max: number) => z.string({ error: `The ${field} must be text.` }).trim().max(max, `The ${field} is too long.`);
const editBody = z
  .object({ name: text("name", 200).min(1, "The name is required."), address: text("address", 200), city: text("city", 100), lat: coordinate, lng: coordinate })
  .refine((b) => (b.lat === null) === (b.lng === null), "Give both latitude and longitude, or neither.")
  .refine(
    (b) => b.lat === null || b.lng === null || (b.lat >= ISRAEL.lat[0] && b.lat <= ISRAEL.lat[1] && b.lng >= ISRAEL.lng[0] && b.lng <= ISRAEL.lng[1]),
    "The location is outside Israel.",
  );

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
    if (!query.success) return bad(c, query.error);
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
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const { db } = c.var.deps;
    const store = db.select(columns).from(stores).innerJoin(chains, eq(chains.id, stores.chainId)).where(eq(stores.id, param.data.id)).get();
    if (!store) return c.json({ error: "not found" }, 404);
    const stats = db.select({ priceCount: count(), updatedAt: max(prices.updatedAt) }).from(prices).where(eq(prices.storeId, store.id)).get();
    return c.json({ store: { ...store, priceCount: stats?.priceCount ?? 0, pricesUpdatedAt: stats?.updatedAt ?? null } }, 200);
  })
  // The operator's correction. A Price sync never changes these again (ADR 0006); a cleared location is geocoded on the next one.
  .put(
    "/:id",
    jsonBody(editBody),
    (c) => {
      const param = idParam.safeParse(c.req.param());
      if (!param.success) return bad(c, param.error);
      const { id } = param.data;
      const edit = c.req.valid("json");
      const { changes } = c.var.deps.db.update(stores).set(edit).where(eq(stores.id, id)).run();
      if (changes === 0) return c.json({ error: "not found" }, 404);
      return c.json({ store: { id, ...edit } }, 200);
    },
  );
