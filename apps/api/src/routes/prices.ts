import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Db } from "#/db/index.ts";
import { commonest, ftsMatch, groupRefSchema, measureOf, nameWords, parseRef, sameMeasure, searchGroups, startsGroup, withoutSizes } from "#/prices/groups.ts";
import { requireUser, type AppEnv } from "#/middleware.ts";

const searchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const compareBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().min(1).max(50).default(10),
    // A group ref among the codes comes from an app build from before Product groups (see legacyMatch in lists.ts).
    codes: z.array(z.union([z.string().trim().min(1).max(64), groupRefSchema])).max(200).default([]),
    groups: z.array(z.object({ ref: groupRefSchema, amount: z.number().positive().max(1000).optional() })).max(200).default([]),
    sort: z.enum(["price", "distance", "coverage"]).default("price"),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .refine((b) => b.codes.length + b.groups.length > 0, "codes or groups required");

const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);
const round2 = (n: number) => Math.round(n * 100) / 100;

type Found = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; storeCount: number; minPrice: number };
const productCols = `p.code, p.name, p.manufacturer, p.unit_qty AS unitQty, p.is_weighted AS isWeighted, count(pr.store_id) AS storeCount, min(pr.price) AS minPrice`;
// The product named exactly the first word comes first, then products named after the word ("חלב 3%" before "שוקולד
// חלב", both before "חלבה"), then the most widely priced. LIKE matches ASCII case-insensitively, as the FTS tokenizer does.
// shortcut: candidates are capped at 3000; a group's members rank in the first tiers, so only a bigger group loses some.
// Raise the cap or count members in SQL when one real search hits it.
const FTS_SEARCH = `SELECT ${productCols},
     CASE WHEN p.name LIKE @first THEN 0 WHEN p.name LIKE @first || ' %' THEN 1
       WHEN ' ' || p.name || ' ' LIKE '% ' || @first || ' %' THEN 2 ELSE 3 END AS tier
   FROM products_fts f JOIN products p ON p.code = f.code JOIN prices pr ON pr.code = p.code
   WHERE products_fts MATCH @match GROUP BY p.code ORDER BY tier, storeCount DESC, min(f.rank) LIMIT 3000`;
const CODE_SEARCH = `SELECT ${productCols} FROM products p JOIN prices pr ON pr.code = p.code
   WHERE p.code = ? OR (p.code LIKE ? AND instr(p.code, ':') = 0) GROUP BY p.code ORDER BY p.code = ? DESC, storeCount DESC LIMIT ?`;

const productResult = ({ isWeighted, ...p }: Found) => ({ kind: "product" as const, ...p, ...(measureOf({ ...p, isWeighted }) ?? { measure: null, size: null }) });

/**
 * Product search: the Product groups the query's words name come first (most stores first), then specific products.
 * A barcode (8+ digits) returns products only: the exact code, then code prefixes.
 */
export function searchProducts(db: Db, q: string, limit: number) {
  const sqlite = db.$client;
  if (/^\d{8,}$/.test(q)) return (sqlite.prepare(CODE_SEARCH).all(q, `${q}%`, q, limit) as Found[]).map(productResult);
  // Quoted prefix terms keep AND/OR/NOT/NEAR literal; punctuation never reaches FTS (words are letter runs and numbers).
  const typed = nameWords(q);
  const words = typed.map((w) => w.norm);
  const find = (match: string) => (match ? sqlite.prepare(FTS_SEARCH).all({ match, first: typed[0]!.raw }) : []) as (Found & { tier: number })[];
  const found = find(ftsMatch(words));
  // A typed size narrows the products but never the group ("בורגול 500 גרם" names all of "בורגול").
  const groupWords = withoutSizes(words);
  const pool = groupWords.length === words.length ? found : find(ftsMatch(groupWords));
  const groups = searchGroups(groupWords, pool).map(({ codes, minPrice, ...g }) => {
    const { n } = sqlite.prepare("SELECT count(DISTINCT store_id) AS n FROM prices WHERE code IN (SELECT value FROM json_each(?))").get(JSON.stringify(codes)) as { n: number };
    // code: the ref, for app builds from before Product groups, which pick a result by its code.
    return { kind: "group" as const, ...g, code: g.ref, minPrice: round2(minPrice), productCount: codes.length, storeCount: n };
  });
  groups.sort((a, b) => b.storeCount - a.storeCount);
  return [...groups, ...found.slice(0, limit).map(({ tier: _, ...p }) => productResult(p))];
}

/** Every product in the group the ref names, with its size (kilos, liters or pack count). */
function groupMembers(db: Db, ref: string) {
  const { words, size } = parseRef(ref)!;
  const match = ftsMatch(words);
  if (!match) return [];
  const rows = db.$client
    .prepare("SELECT p.code, p.name, p.unit_qty AS unitQty, p.is_weighted AS isWeighted FROM products_fts f JOIN products p ON p.code = f.code WHERE products_fts MATCH ?")
    .all(match) as { code: string; name: string; unitQty: string | null; isWeighted: number }[];
  return rows.flatMap((p) => {
    const own = measureOf(p);
    return own && sameMeasure(own, size) && startsGroup(nameWords(p.name), words) ? [{ code: p.code, name: p.name, size: own.size }] : [];
  });
}

const R = 6371;
const KM_PER_DEG = 111; // below R*pi/180 = 111.195 so the bounding box always contains the circle
const rad = (d: number) => (d * Math.PI) / 180;
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type PriceRow = {
  storeId: string; chainId: string; chainName: string; orderUrl: string | null; storeName: string;
  address: string; city: string; lat: number; lng: number; code: string; price: number;
};
type GroupItem = { ref: string; code: string; name: string; size: number; unitPrice?: number; price: number };

/**
 * What the list costs at each store within `radiusKm`, sorted and cut to `limit`, plus codes and group refs no store
 * carries (`missingCodes` and `unmatched` hold both). Each store is charged, per group, its cheapest product of the
 * group: by price per kilo or liter times the amount (kilos or liters, by default the group's commonest pack size), or
 * for a unit group the cheapest pack times the amount (packs, by default 1).
 */
export function compareStores(db: Db, query: z.infer<typeof compareBody>) {
  const { lat, lng, radiusKm, sort, limit } = query;
  const isRef = (k: string) => parseRef(k) !== null;
  const codes = [...new Set(query.codes.filter((k) => !isRef(k)))];
  const legacyGroups = query.codes.filter(isRef).map((ref) => ({ ref, amount: undefined }));
  const groups = [...new Map([...legacyGroups, ...query.groups].map((g) => [g.ref, g])).values()].map(({ ref, amount }) => {
    const members = groupMembers(db, ref);
    const byQuantity = parseRef(ref)!.size.measure !== "unit"; // priced per kilo or liter
    return { ref, byQuantity, members, amount: amount ?? (byQuantity ? (commonest(members.map((m) => m.size)) ?? 1) : 1) };
  });
  const asked = [...codes, ...groups.map((g) => g.ref)];
  const priced = [...new Set([...codes, ...groups.flatMap((g) => g.members.map((m) => m.code))])];
  const dLat = radiusKm / KM_PER_DEG;
  const dLng = radiusKm / (KM_PER_DEG * Math.max(Math.cos(rad(lat)), 0.01));
  const rows = db.$client
    .prepare(
      `SELECT s.id AS storeId, s.chain_id AS chainId, ch.name AS chainName, ch.order_url AS orderUrl, s.name AS storeName,
         s.address, s.city, s.lat, s.lng, pr.code, pr.price
       FROM prices pr JOIN stores s ON s.id = pr.store_id JOIN chains ch ON ch.id = s.chain_id
       WHERE s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ? AND pr.code IN (SELECT value FROM json_each(?))`,
    )
    .all(lat - dLat, lat + dLat, lng - dLng, lng + dLng, JSON.stringify(priced)) as PriceRow[];

  const byStore = new Map<string, { row: PriceRow; distanceKm: number; prices: Map<string, number> }>();
  for (const r of rows) {
    let s = byStore.get(r.storeId);
    if (!s) {
      const distanceKm = haversineKm(lat, lng, r.lat, r.lng);
      if (distanceKm > radiusKm) continue;
      byStore.set(r.storeId, (s = { row: r, distanceKm, prices: new Map() }));
    }
    s.prices.set(r.code, r.price);
  }

  const carried = new Set<string>();
  const stores = [...byStore.values()].map(({ row, distanceKm, prices }) => {
    const items: ({ code: string; price: number } | GroupItem)[] = codes.flatMap((code) => (prices.has(code) ? [{ code, price: prices.get(code)! }] : []));
    for (const g of groups) {
      let best: { code: string; name: string; size: number; each: number } | undefined;
      for (const m of g.members) {
        const price = prices.get(m.code);
        const each = price === undefined ? Infinity : g.byQuantity ? price / m.size : price;
        if (each < (best?.each ?? Infinity)) best = { ...m, each };
      }
      if (best) {
        const { each, ...product } = best;
        items.push({ ref: g.ref, ...product, ...(g.byQuantity ? { unitPrice: round2(each) } : {}), price: round2(each * g.amount) });
      }
    }
    const have = new Set(items.map((i) => ("ref" in i ? i.ref : i.code)));
    have.forEach((k) => carried.add(k));
    const { code: _c, price: _p, orderUrl, ...store } = row;
    return {
      ...store,
      distanceKm: round2(distanceKm),
      total: round2(items.reduce((sum, i) => sum + i.price, 0)),
      matched: items.length,
      missingCodes: asked.filter((k) => !have.has(k)),
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
  return { stores: stores.slice(0, limit), unmatched: asked.filter((k) => !carried.has(k)) };
}

export const pricesRoutes = new Hono<AppEnv>()
  .get("/chains", requireUser, (c) =>
    c.json(c.var.deps.db.$client.prepare("SELECT id, name, name_he AS nameHe, order_url AS orderUrl FROM chains ORDER BY name").all()),
  )
  .get("/products/search", requireUser, (c) => {
    const p = searchQuery.safeParse(c.req.query());
    if (!p.success) return bad(c, p.error);
    return c.json(searchProducts(c.var.deps.db, p.data.q, p.data.limit));
  })
  .post("/compare", requireUser, async (c) => {
    const p = compareBody.safeParse(await c.req.json().catch(() => undefined));
    if (!p.success) return bad(c, p.error);
    return c.json(compareStores(c.var.deps.db, p.data));
  });
