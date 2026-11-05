import { and, asc, count, eq, isNull, max, ne, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { chains, prices, promotions, stores } from "#/db/appSchema.ts";
import type { AppEnv } from "#/middleware.ts";
import { bad } from "#/routes/internal/valid.ts";

const PAGE_SIZE = 100;
const idParam = z.object({ id: z.string().min(1).max(ID.maxLength) });
const listQuery = z.object({
  chain: z.string().min(1).max(ID.maxLength).optional(),
  noLocation: z.stringbool().optional(),
  publishedDiffers: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

// A box around Israel; a looser fence than a border, enough to catch a swapped or mistyped coordinate.
const ISRAEL = { lat: ["Latitude", 29.4, 33.4], lng: ["Longitude", 34.2, 35.95] } as const;
const coordinate = z.number({ error: "Latitude and longitude must be numbers." }).nullable();
const text = (field: string, max: number) => z.string({ error: `The ${field} must be text.` }).trim().max(max, `The ${field} is too long.`);
// Each issue's path names the form field it is about, so the dashboard shows it under that field.
const editBody = z
  .object({ name: text("name", 200).min(1, "The name is required."), address: text("address", 200), city: text("city", 100), lat: coordinate, lng: coordinate })
  .superRefine((b, ctx) => {
    if ((b.lat === null) !== (b.lng === null))
      return ctx.addIssue({ code: "custom", message: "Give both latitude and longitude, or neither.", path: [b.lat === null ? "lat" : "lng"] });
    for (const key of ["lat", "lng"] as const) {
      const [name, min, max] = ISRAEL[key];
      const v = b[key];
      if (v !== null && (v < min || v > max)) ctx.addIssue({ code: "custom", message: `Outside Israel. ${name} runs from ${min} to ${max}: check the digits.`, path: [key] });
    }
  });
/** The edit body, or a 400 with the first issue's message and the field it is about (null when it is about none). */
const editJson = validator("json", (value, c) => {
  const body = editBody.safeParse(value);
  if (body.success) return body.data;
  const issue = body.error.issues[0];
  return c.json({ error: issue?.message ?? "invalid request", field: typeof issue?.path[0] === "string" ? issue.path[0] : null }, 400);
});

const NO_LOCATION = or(isNull(stores.lat), isNull(stores.lng))!;
const DIFFERS = or(ne(stores.address, stores.publishedAddress), ne(stores.city, stores.publishedCity))!;
const countWhere = (condition: SQL) => sql<number>`count(CASE WHEN ${condition} THEN 1 END)`;

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
  // One page of the filtered stores by name, their total, every one of them with a location for the map, and the
  // Chain's (or every) store count for each filter.
  .get("/", (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    const { chain, noLocation, publishedDiffers, page } = query.data;
    const { db } = c.var.deps;
    const ofChain = chain ? eq(stores.chainId, chain) : undefined;
    const where = and(ofChain, noLocation ? NO_LOCATION : undefined, publishedDiffers ? DIFFERS : undefined);
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
    const counts = db.select({ all: count(), noLocation: countWhere(NO_LOCATION), publishedDiffers: countWhere(DIFFERS) }).from(stores).where(ofChain).get()!;
    return c.json({ stores: rows, total, page, pageSize: PAGE_SIZE, locations, counts }, 200);
  })
  // One store with its price count, when its prices were last updated, and how many Promotions it has.
  .get("/:id", (c) => {
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return bad(c, param.error);
    const { db } = c.var.deps;
    const store = db.select(columns).from(stores).innerJoin(chains, eq(chains.id, stores.chainId)).where(eq(stores.id, param.data.id)).get();
    if (!store) return c.json({ error: "not found" }, 404);
    const stats = db.select({ priceCount: count(), updatedAt: max(prices.updatedAt) }).from(prices).where(eq(prices.storeId, store.id)).get();
    const promotionCount = db.select({ n: count() }).from(promotions).where(eq(promotions.storeId, store.id)).get()?.n ?? 0;
    return c.json({ store: { ...store, priceCount: stats?.priceCount ?? 0, pricesUpdatedAt: stats?.updatedAt ?? null, promotionCount } }, 200);
  })
  // The operator's correction. A Price sync never changes these again (ADR 0006); a cleared location is geocoded on the next one.
  .put(
    "/:id",
    editJson,
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
