import { Hono, type Context } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { QUANTITY } from "@grocer/shared/quantity";
import { SEARCH } from "@grocer/shared/search";
import type { Db } from "#/db/index.ts";
import { commonest, groupMembers, groupRefSchema, parseRef } from "#/prices/groups.ts";
import { requireUser, type AppEnv } from "#/middleware.ts";
import { nearbyStores } from "#/prices/nearby.ts";
import { priceLines, round2, runningPromotions, type AppliedPromotion } from "#/prices/promotions.ts";
import { searchProducts } from "#/prices/search.ts";

const quantity = z.number().positive().max(QUANTITY.max);
const searchQuery = z.object({
  q: z.string().trim().min(SEARCH.minLength).max(SEARCH.maxLength),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  storeId: z.string().trim().min(1).max(ID.maxLength).optional(),
});
const compareBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().min(1).max(50).default(10),
    items: z.array(z.object({ code: z.string().trim().min(1).max(ID.maxLength), quantity })).default([]),
    groups: z.array(z.object({ ref: groupRefSchema, quantity: quantity.default(QUANTITY.start) })).default([]),
    sort: z.enum(["price", "distance", "coverage"]).default("price"),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .refine((b) => b.items.length + b.groups.length > 0, "items or groups required")
  .refine((b) => b.items.length + b.groups.length <= 200, "at most 200 items and groups"); // a group is one entry, however many products it holds

const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);

type PriceRow = {
  storeId: string; chainId: string; chainName: string; orderUrl: string | null; onlineStoreId: string | null; storeName: string;
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
  const { sort, limit } = query;
  const codes = sumByKey(query.items.map((i) => ({ key: i.code, quantity: i.quantity })));
  const groups = [...sumByKey(query.groups.map((g) => ({ key: g.ref, quantity: g.quantity })))].map(([ref, quantity]) => {
    const { members, soldBy } = groupMembers(db, ref);
    const byQuantity = parseRef(ref)!.size.measure !== "unit"; // priced per kilo or liter
    const perStep = byQuantity && soldBy === "unit" ? (commonest(members.map((m) => m.size)) ?? 1) : 1; // kilos or liters in one of `quantity`
    return { ref, byQuantity, members, quantity, perStep, soldBy };
  });
  const asked = [...codes.keys(), ...groups.map((g) => g.ref)];
  const near = new Map(nearbyStores(db, query).map((s) => [s.id, s.km]));
  const wantedCodes = [...new Set([...codes.keys(), ...groups.flatMap((g) => g.members.map((m) => m.code))])];
  const rows = db.$client
    .prepare(
      `SELECT s.id AS storeId, s.chain_id AS chainId, ch.name AS chainName, ch.order_url AS orderUrl,
         ch.online_store_id AS onlineStoreId, s.name AS storeName,
         s.address, s.city, s.lat, s.lng, pr.code, pr.price
       FROM prices pr JOIN stores s ON s.id = pr.store_id JOIN chains ch ON ch.id = s.chain_id
       WHERE pr.store_id IN (SELECT value FROM json_each(?)) AND pr.code IN (SELECT value FROM json_each(?))`,
    )
    .all(JSON.stringify([...near.keys()]), JSON.stringify(wantedCodes)) as PriceRow[];

  const byStore = new Map<string, { row: PriceRow; distanceKm: number; prices: Map<string, number> }>();
  for (const r of rows) {
    let s = byStore.get(r.storeId);
    if (!s) byStore.set(r.storeId, (s = { row: r, distanceKm: near.get(r.storeId)!, prices: new Map() }));
    s.prices.set(r.code, r.price);
  }

  const promos = runningPromotions(db, [...byStore.keys()], wantedCodes, now);
  // The online stores' prices of the groups' products: a cart link buys each group's product from its chain's online store.
  const onlineIds = [...new Set([...byStore.values()].flatMap((s) => (s.row.onlineStoreId ? [s.row.onlineStoreId] : [])))];
  const online = new Map<string, Map<string, number>>();
  if (groups.length && onlineIds.length) {
    const memberCodes = [...new Set(groups.flatMap((g) => g.members.map((m) => m.code)))];
    const onlineRows = db.$client
      .prepare("SELECT store_id AS storeId, code, price FROM prices WHERE store_id IN (SELECT value FROM json_each(?)) AND code IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(onlineIds), JSON.stringify(memberCodes)) as { storeId: string; code: string; price: number }[];
    for (const r of onlineRows) online.set(r.storeId, (online.get(r.storeId) ?? new Map()).set(r.code, r.price));
  }
  /** The group's barcoded product the online store prices cheapest (per kilo or liter for those groups), and how many to buy. */
  const onlinePick = (g: (typeof groups)[number], prices: Map<string, number> | undefined) => {
    let best: { code: string; quantity: number; each: number } | undefined;
    for (const m of g.members) {
      const price = prices?.get(m.code);
      if (price === undefined || m.code.includes(":")) continue;
      const each = g.byQuantity ? price / m.size : price;
      if (!best || each < best.each) best = { code: m.code, quantity: g.byQuantity ? (g.perStep * g.quantity) / m.size : g.quantity, each };
    }
    return best;
  };
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
    // The chain's online shop takes `barcode,quantity;...` (docs/research/price-data.md section 6): the products as priced
    // here, chain-local codes left out (no shop knows them). Every group on the list, even one missing here, buys the
    // product the chain's online store prices cheapest, by Shelf price (Promotions are the shop's to apply), or else the
    // one bought here.
    const bought = new Map(groupLines.map(({ g }, j) => [g.ref, lines[products.length + j]!]));
    const onlinePrices = online.get(row.onlineStoreId ?? "");
    const cart = [
      ...lines.slice(0, products.length).map((l) => ({ ...l, packs: false })),
      ...groups.flatMap((g) => {
        const pick = onlinePick(g, onlinePrices) ?? bought.get(g.ref);
        return pick ? [{ ...pick, packs: g.soldBy === "unit" }] : [];
      }),
    ]
      .flatMap(({ code, quantity, packs }) => (code.includes(":") ? [] : [`${code},${packs ? Math.ceil(round2(quantity)) : round2(quantity)}`]))
      .join(";");
    const { code: _c, price: _p, orderUrl, onlineStoreId: _o, ...store } = row;
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
