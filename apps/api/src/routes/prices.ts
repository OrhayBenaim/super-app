import { Hono, type Context } from "hono";
import { z } from "zod";
import { QUANTITY } from "@grocer/shared/quantity";
import { SEARCH } from "@grocer/shared/search";
import type { Db } from "#/db/index.ts";
import { commonest, ftsMatch, groupMembers, groupRefSchema, measureOf, nameWords, parseRef, searchGroups, soldByOf, withoutSizes } from "#/prices/groups.ts";
import { requireUser, type AppEnv } from "#/middleware.ts";
import { boundingBox, haversineKm } from "#/prices/nearby.ts";
import { priceLines, runningPromotions, type AppliedPromotion } from "#/prices/promotions.ts";

const quantity = z.number().positive().max(QUANTITY.max);
const searchQuery = z.object({
  q: z.string().trim().min(SEARCH.minLength).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  storeId: z.string().trim().min(1).max(64).optional(),
});
const compareBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().min(1).max(50).default(10),
    items: z.array(z.object({ code: z.string().trim().min(1).max(64), quantity })).default([]),
    groups: z.array(z.object({ ref: groupRefSchema, quantity: quantity.default(QUANTITY.start) })).default([]),
    sort: z.enum(["price", "distance", "coverage"]).default("price"),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .refine((b) => b.items.length + b.groups.length > 0, "items or groups required")
  .refine((b) => b.items.length + b.groups.length <= 200, "at most 200 items and groups"); // a group is one entry, however many products it holds

const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);
const round2 = (n: number) => Math.round(n * 100) / 100;

// minPrice is the lowest price anywhere, or with @store that store's price (null when it does not price the product).
type Found = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; storeCount: number; minPrice: number | null };
const productCols = `p.code, p.name, p.manufacturer, p.unit_qty AS unitQty, p.is_weighted AS isWeighted`;
// The product named exactly the first word comes first, then products named after the word ("חלב 3%" before "שוקולד
// חלב", both before "חלבה"), then the most widely priced. LIKE matches ASCII case-insensitively, as the FTS tokenizer does.
// Store count and min price are per-product lookups in the covering prices index: a JOIN + GROUP BY over every price
// row was 4x slower. Products no store prices are left out.
// shortcut: candidates are capped at 3000; a group's members rank in the first tiers, so only a bigger group loses some.
// Raise the cap or count members in SQL when one real search hits it. With @store, what it prices ranks first, so the cap
// only drops products it does not price (kept as candidates because groups form from every product).
const FTS_SEARCH = `SELECT ${productCols},
     (SELECT count(*) FROM prices pr WHERE pr.code = p.code) AS storeCount,
     (SELECT min(pr.price) FROM prices pr WHERE pr.code = p.code AND (@store IS NULL OR pr.store_id = @store)) AS minPrice,
     CASE WHEN p.name LIKE @first THEN 0 WHEN p.name LIKE @first || ' %' THEN 1
       WHEN ' ' || p.name || ' ' LIKE '% ' || @first || ' %' THEN 2 ELSE 3 END AS tier
   FROM products_fts f JOIN products p ON p.code = f.code
   WHERE products_fts MATCH @match AND storeCount > 0 ORDER BY minPrice IS NULL, tier, storeCount DESC, f.rank, p.code LIMIT 3000`;
const CODE_SEARCH = `SELECT ${productCols}, count(pr.store_id) AS storeCount,
     min(CASE WHEN @store IS NULL OR pr.store_id = @store THEN pr.price END) AS minPrice FROM products p JOIN prices pr ON pr.code = p.code
   WHERE p.code = @q OR (p.code LIKE @prefix AND instr(p.code, ':') = 0) GROUP BY p.code HAVING minPrice IS NOT NULL
   ORDER BY p.code = @q DESC, storeCount DESC LIMIT @limit`;
const withPrice = <T extends Found>(rows: T[]) => rows.filter((r): r is T & { minPrice: number } => r.minPrice !== null);

const productResult = ({ isWeighted, ...p }: Found & { minPrice: number }) => ({
  kind: "product" as const,
  ...p,
  ...(measureOf({ ...p, isWeighted }) ?? { measure: null, size: null }),
  soldBy: soldByOf({ ...p, isWeighted }),
});

/**
 * Product search: the Product groups the query's words name come first (most stores first), then specific products.
 * A barcode (8+ digits) returns products only: the exact code, then code prefixes.
 * With `storeId`, only what that store prices, at its price: a product's own, a group's cheapest product there.
 */
export function searchProducts(db: Db, q: string, limit: number, storeId?: string) {
  const sqlite = db.$client;
  const store = storeId ?? null;
  if (/^\d{8,}$/.test(q)) return withPrice(sqlite.prepare(CODE_SEARCH).all({ q, prefix: `${q}%`, limit, store }) as Found[]).map(productResult);
  // Quoted prefix terms keep AND/OR/NOT/NEAR literal; punctuation never reaches FTS (words are letter runs and numbers).
  const typed = nameWords(q);
  const words = typed.map((w) => w.norm);
  const find = (match: string) => (match ? sqlite.prepare(FTS_SEARCH).all({ match, first: typed[0]!.raw, store }) : []) as (Found & { tier: number })[];
  const found = find(ftsMatch(words));
  // A typed size narrows the products but never the group ("בורגול 500 גרם" names all of "בורגול").
  const groupWords = withoutSizes(words);
  const pool = groupWords.length === words.length ? found : find(ftsMatch(groupWords));
  // Groups form from every candidate; a member the store does not price costs Infinity, so a group with none there drops out.
  const candidateGroups = searchGroups(groupWords, pool.map((p) => ({ ...p, minPrice: p.minPrice ?? Infinity })));
  const groups = candidateGroups.filter((g) => g.minPrice !== Infinity).map(({ codes, minPrice, ...g }) => {
    const { n } = sqlite.prepare("SELECT count(DISTINCT store_id) AS n FROM prices WHERE code IN (SELECT value FROM json_each(?))").get(JSON.stringify(codes)) as { n: number };
    return { kind: "group" as const, ...g, minPrice: round2(minPrice), productCount: codes.length, storeCount: n };
  });
  groups.sort((a, b) => b.storeCount - a.storeCount);
  return [...groups, ...withPrice(found).slice(0, limit).map(({ tier: _, ...p }) => productResult(p))];
}

type PriceRow = {
  storeId: string; chainId: string; chainName: string; orderUrl: string | null; storeName: string;
  address: string; city: string; lat: number; lng: number; code: string; price: number;
};
// price is the Shelf price; lineTotal is after the line's Promotion (its share of one shared with other lines), when one
// applies; hints are Promotions its Quantity doesn't reach; info are information-only Promotions, never in lineTotal.
type Line = {
  code: string; price: number; quantity: number; lineTotal: number; promotion?: AppliedPromotion; hints?: AppliedPromotion[];
  info?: { id: string; description: string }[];
};
type GroupLine = Line & { ref: string; name: string; size: number; unitPrice?: number };

/** Quantities summed per key (two items matched to one product), in first-seen order. */
const sumByKey = (entries: { key: string; quantity: number }[]) => {
  const sums = new Map<string, number>();
  for (const { key, quantity } of entries) sums.set(key, (sums.get(key) ?? 0) + quantity);
  return sums;
};

/**
 * What the list costs at each store within `radiusKm`, sorted and cut to `limit`, plus codes and group refs no store
 * carries (`missingCodes` and `unmatched` hold both). Each line is a price times a quantity. A product's price is its
 * shelf price (per kilo when sold by weight). A group's price is its cheapest product at that store after Promotions
 * (priced together with the product lines, so Promotions pool across both); `price` stays its Shelf price: for a group sold
 * by weight, per kilo; for another kilo or liter group, the price per kilo or liter of the group's commonest pack size,
 * so the quantity counts those packs; for a unit group, the cheapest pack.
 */
export function compareStores(db: Db, query: z.infer<typeof compareBody>, now: Date) {
  const { lat, lng, radiusKm, sort, limit } = query;
  const codes = sumByKey(query.items.map((i) => ({ key: i.code, quantity: i.quantity })));
  const groups = [...sumByKey(query.groups.map((g) => ({ key: g.ref, quantity: g.quantity })))].map(([ref, quantity]) => {
    const { members, soldBy } = groupMembers(db, ref);
    const byQuantity = parseRef(ref)!.size.measure !== "unit"; // priced per kilo or liter
    const perStep = byQuantity && soldBy === "unit" ? (commonest(members.map((m) => m.size)) ?? 1) : 1; // kilos or liters in one of `quantity`
    return { ref, byQuantity, members, quantity, perStep, soldBy };
  });
  const asked = [...codes.keys(), ...groups.map((g) => g.ref)];
  const wantedCodes = [...new Set([...codes.keys(), ...groups.flatMap((g) => g.members.map((m) => m.code))])];
  const rows = db.$client
    .prepare(
      `SELECT s.id AS storeId, s.chain_id AS chainId, ch.name AS chainName, ch.order_url AS orderUrl, s.name AS storeName,
         s.address, s.city, s.lat, s.lng, pr.code, pr.price
       FROM prices pr JOIN stores s ON s.id = pr.store_id JOIN chains ch ON ch.id = s.chain_id
       WHERE s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ? AND pr.code IN (SELECT value FROM json_each(?))`,
    )
    .all(...boundingBox(query), JSON.stringify(wantedCodes)) as PriceRow[];

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

  const promos = runningPromotions(db, [...byStore.keys()], wantedCodes, now);
  const carried = new Set<string>();
  const stores = [...byStore.values()].map(({ row, distanceKm, prices }) => {
    const optionsOf = (code: string, quantity: number) => {
      const price = prices.get(code);
      if (price === undefined) return [];
      const shelf = { code, price, quantity };
      return [shelf, ...(promos.get(`${row.storeId} ${code}`) ?? []).map((promo) => ({ ...shelf, promo }))];
    };
    const products = [...codes].map(([code, quantity]) => optionsOf(code, quantity)).filter((o) => o.length);
    // A group line can buy any member at this store; a kilo or liter group buys its kilos or liters in the member's packs.
    const groupLines = groups.flatMap((g) => {
      const options = g.members.flatMap((m) => optionsOf(m.code, g.byQuantity ? (g.perStep * g.quantity) / m.size : g.quantity));
      return options.length ? [{ g, options }] : [];
    });
    const priced = priceLines([...products, ...groupLines.map((l) => l.options)]);
    const lines = priced.lines.map(({ option: { promo: _, ...line }, ...rest }) => ({ ...line, ...rest }));
    const items: (Line | GroupLine)[] = lines.slice(0, products.length);
    groupLines.forEach(({ g }, j) => {
      const { code, price, quantity: _, ...rest } = lines[products.length + j]!;
      const { name, size } = g.members.find((m) => m.code === code)!;
      const each = g.byQuantity ? price / size : price;
      items.push({ ref: g.ref, code, name, size, ...(g.byQuantity ? { unitPrice: round2(each) } : {}), price: round2(each * g.perStep), quantity: g.quantity, ...rest });
    });
    const have = new Set(items.map((i) => ("ref" in i ? i.ref : i.code)));
    have.forEach((k) => carried.add(k));
    // The chain's online shop takes `barcode,quantity;...` (docs/research/price-data.md section 6): the lines as priced
    // here, a group as the packs of the product it bought, chain-local codes left out (no shop knows them).
    const cart = lines
      .flatMap(({ code, quantity }, i) => {
        if (code.includes(":")) return [];
        const packs = groupLines[i - products.length]?.g.soldBy === "unit";
        return [`${code},${packs ? Math.ceil(round2(quantity)) : round2(quantity)}`];
      })
      .join(";");
    const { code: _c, price: _p, orderUrl, ...store } = row;
    const fillsCart = !!cart && !!orderUrl?.includes("{items}");
    return {
      ...store,
      distanceKm: round2(distanceKm),
      // the sum of the lines as shown, less the spend deals' savings
      total: round2(items.reduce((a, i) => a + i.lineTotal, 0) - priced.basket.reduce((a, d) => a + d.saving, 0)),
      matched: items.length,
      missingCodes: asked.filter((k) => !have.has(k)),
      items,
      ...(priced.basket.length ? { basket: priced.basket } : {}),
      orderUrl: orderUrl?.replace("{items}", fillsCart ? encodeURIComponent(cart) : "") ?? null,
      fillsCart,
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
    return c.json(searchProducts(c.var.deps.db, p.data.q, p.data.limit, p.data.storeId));
  })
  .post("/compare", requireUser, async (c) => {
    const p = compareBody.safeParse(await c.req.json().catch(() => undefined));
    if (!p.success) return bad(c, p.error);
    return c.json(compareStores(c.var.deps.db, p.data, c.var.deps.clock.now()));
  });
