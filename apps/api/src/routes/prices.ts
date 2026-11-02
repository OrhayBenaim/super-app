import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Db } from "#/db/index.ts";
import { requireUser, type AppEnv } from "#/middleware.ts";

const searchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const compareBody = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(50).default(10),
  codes: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
  sort: z.enum(["price", "distance", "coverage"]).default("price"),
  limit: z.number().int().min(1).max(100).default(20),
});

const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);

const productCols = `p.code, p.name, p.manufacturer, p.unit_qty AS unitQty, count(pr.store_id) AS storeCount, min(pr.price) AS minPrice`;
const FTS_SEARCH = `SELECT ${productCols} FROM products_fts f JOIN products p ON p.code = f.code JOIN prices pr ON pr.code = p.code
   WHERE products_fts MATCH ? GROUP BY p.code ORDER BY min(f.rank), storeCount DESC LIMIT ?`;
const LIKE_SEARCH = `SELECT ${productCols} FROM products p JOIN prices pr ON pr.code = p.code
   WHERE p.name LIKE ? ESCAPE '\\' OR p.code = ? GROUP BY p.code ORDER BY storeCount DESC LIMIT ?`;
const CODE_SEARCH = `SELECT ${productCols} FROM products p JOIN prices pr ON pr.code = p.code
   WHERE p.code = ? OR (p.code LIKE ? AND instr(p.code, ':') = 0) GROUP BY p.code ORDER BY p.code = ? DESC, storeCount DESC LIMIT ?`;

/** Barcode, name prefix (FTS) or free text (LIKE) search over products that some store prices. */
export function searchProducts(db: Db, q: string, limit: number) {
  const sqlite = db.$client;
  const tokens = q.split(/\s+/);
  // Letters/digits only go to FTS as quoted prefix terms (quotes keep AND/OR/NOT/NEAR literal); anything else (quotes, %, -) would be FTS syntax, so use LIKE.
  if (/^\d{8,}$/.test(q)) return sqlite.prepare(CODE_SEARCH).all(q, `${q}%`, q, limit); // barcode: exact code first, then code prefix
  if (tokens.every((t) => /^[\p{L}\p{N}]+$/u.test(t)))
    return sqlite.prepare(FTS_SEARCH).all(tokens.map((t) => `"${t}"*`).join(" "), limit);
  return sqlite.prepare(LIKE_SEARCH).all(`%${q.replace(/[\\%_]/g, "\\$&")}%`, q, limit);
}

const MATCH = `SELECT f.code FROM products_fts f JOIN prices pr ON pr.code = f.code
   WHERE products_fts MATCH ? AND f.name = ? GROUP BY f.code ORDER BY count(*) DESC LIMIT 1`;

/** The product named exactly `name` that the most stores price, or null. Exact names only: the top search hit for "חלב" is halva. */
export function matchProduct(db: Db, name: string): string | null {
  const phrase = `"${name.replace(/"/g, '""')}"`; // the FTS phrase narrows to candidates; "" escapes a quote inside it
  const row = db.$client.prepare(MATCH).get(phrase, name) as { code: string } | undefined;
  return row?.code ?? null;
}

const R = 6371;
const KM_PER_DEG = 111; // below R*pi/180 = 111.195 so the bounding box always contains the circle
const rad = (d: number) => (d * Math.PI) / 180;
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const round2 = (n: number) => Math.round(n * 100) / 100;

type PriceRow = {
  storeId: string; chainId: string; chainName: string; orderUrl: string | null; storeName: string;
  address: string; city: string; lat: number; lng: number; code: string; price: number;
};

/** What the list costs at each store within `radiusKm`, sorted and cut to `limit`, plus codes no store carries. */
export function compareStores(db: Db, query: z.infer<typeof compareBody>) {
  const { lat, lng, radiusKm, sort, limit } = query;
  const codes = [...new Set(query.codes)];
  const dLat = radiusKm / KM_PER_DEG;
  const dLng = radiusKm / (KM_PER_DEG * Math.max(Math.cos(rad(lat)), 0.01));
  const rows = db.$client
    .prepare(
      `SELECT s.id AS storeId, s.chain_id AS chainId, ch.name AS chainName, ch.order_url AS orderUrl, s.name AS storeName,
         s.address, s.city, s.lat, s.lng, pr.code, pr.price
       FROM prices pr JOIN stores s ON s.id = pr.store_id JOIN chains ch ON ch.id = s.chain_id
       WHERE s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ? AND pr.code IN (${codes.map(() => "?").join(",")})`,
    )
    .all(lat - dLat, lat + dLat, lng - dLng, lng + dLng, ...codes) as PriceRow[];

  const byStore = new Map<string, { row: PriceRow; distanceKm: number; items: { code: string; price: number }[] }>();
  for (const r of rows) {
    let s = byStore.get(r.storeId);
    if (!s) {
      const distanceKm = haversineKm(lat, lng, r.lat, r.lng);
      if (distanceKm > radiusKm) continue;
      byStore.set(r.storeId, (s = { row: r, distanceKm, items: [] }));
    }
    s.items.push({ code: r.code, price: r.price });
  }

  const carried = new Set<string>();
  const stores = [...byStore.values()].map(({ row, distanceKm, items }) => {
    const have = new Set(items.map((i) => i.code));
    have.forEach((code) => carried.add(code));
    const { code: _c, price: _p, orderUrl, ...store } = row;
    return {
      ...store,
      distanceKm: round2(distanceKm),
      total: round2(items.reduce((sum, i) => sum + i.price, 0)),
      matched: items.length,
      missingCodes: codes.filter((code) => !have.has(code)),
      items,
      orderUrl: orderUrl?.replace("{code}", encodeURIComponent(items[0]!.code)) ?? null,
    };
  });

  type S = (typeof stores)[number];
  const order: Record<typeof sort, (a: S, b: S) => number> = {
    price: (a, b) => a.missingCodes.length - b.missingCodes.length || a.total - b.total,
    distance: (a, b) => a.distanceKm - b.distanceKm,
    coverage: (a, b) => b.matched - a.matched || a.total - b.total,
  };
  stores.sort((a, b) => order[sort](a, b) || a.distanceKm - b.distanceKm);
  return { stores: stores.slice(0, limit), unmatched: codes.filter((code) => !carried.has(code)) };
}

export const pricesRoutes = new Hono<AppEnv>()
  .get("/chains", (c) =>
    c.json(c.var.deps.db.$client.prepare("SELECT id, name, name_he AS nameHe, order_url AS orderUrl FROM chains ORDER BY name").all()),
  )
  .get("/products/search", (c) => {
    const p = searchQuery.safeParse(c.req.query());
    if (!p.success) return bad(c, p.error);
    return c.json(searchProducts(c.var.deps.db, p.data.q, p.data.limit));
  })
  .post("/compare", requireUser, async (c) => {
    const p = compareBody.safeParse(await c.req.json().catch(() => undefined));
    if (!p.success) return bad(c, p.error);
    return c.json(compareStores(c.var.deps.db, p.data));
  });
