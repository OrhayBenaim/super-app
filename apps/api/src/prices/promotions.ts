// Promotions applied at Compare time (docs/adr/0003): per store, the combination of running Promotions with the lowest total.
import type { Db } from "#/db/index.ts";
import { jerusalemWeekday } from "#/utils/clock.ts";

export type Audience = "all" | "club" | "card" | "coupon";
/** One row per product a Promotion covers: rows sharing `id` (at one store) are one Promotion whose units pool. */
export type RunningPromotion = {
  storeId: string;
  code: string;
  id: string; // the Chain's PromotionID, so lines sharing a Promotion can name it
  kind: "price" | "bundle" | "percent" | "nth" | "off" | "info"; // info: shown with its description, never in a total
  description: string;
  minQty: number;
  amount: number;
  audience: Audience;
  limitQty: number | null;
  weighted: 0 | 1; // the product is weighed, so Quantity, minQty and limitQty are kilos
};

/** The Promotions on `codes` at `storeIds` running at `now` (start, end, Israeli weekday), by `${storeId} ${code}`. */
export function runningPromotions(db: Db, storeIds: string[], codes: string[], now: Date) {
  const rows = db.$client
    .prepare(
      `SELECT p.store_id AS storeId, pi.code, p.promotion_id AS id, p.kind, p.description, p.min_qty AS minQty, p.amount, p.audience, p.limit_qty AS limitQty,
         COALESCE(pr.is_weighted, 0) AS weighted
       FROM promotion_items pi JOIN promotions p ON p.id = pi.promotion_id LEFT JOIN products pr ON pr.code = pi.code
       WHERE pi.code IN (SELECT value FROM json_each(?)) AND p.store_id IN (SELECT value FROM json_each(?))
         AND p.starts_at <= ? AND p.ends_at > ? AND (p.days IS NULL OR instr(',' || p.days || ',', ?) > 0)`,
    )
    .all(JSON.stringify(codes), JSON.stringify(storeIds), now.getTime(), now.getTime(), `,${jerusalemWeekday(now)},`) as RunningPromotion[];
  const byLine = new Map<string, RunningPromotion[]>();
  for (const r of rows) byLine.set(`${r.storeId} ${r.code}`, [...(byLine.get(`${r.storeId} ${r.code}`) ?? []), r]);
  return byLine;
}

/** One way to buy a List line: a product at its Shelf `price`, with at most one Promotion for all its units. */
export type LineOption = { code: string; price: number; quantity: number; promo?: RunningPromotion };
type Chosen = { line: number; option: LineOption };

const EPS = 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What each line in one Promotion's pool costs (unrounded), in pool order. Units are taken most expensive first: up to
 * the limit per purchase, in full sets of `minQty` for the set kinds; the rest pay the Shelf price. A set's cost is
 * split over its units in proportion to their Shelf prices.
 */
function poolCosts(p: RunningPromotion, pool: Chosen[]) {
  const price = (i: number) => pool[i]!.option.price;
  const left = pool.map((c) => c.option.quantity);
  const cost = pool.map(() => 0);
  const order = pool.map((_, i) => i).sort((a, b) => price(b) - price(a));
  const take = (n: number) => {
    const got: [i: number, units: number][] = [];
    for (const i of order) {
      const u = Math.min(left[i]!, n);
      if (u <= EPS) continue;
      got.push([i, u]);
      left[i]! -= u;
      n -= u;
    }
    return got;
  };
  const covered = Math.min(left.reduce((a, b) => a + b, 0), p.limitQty ?? Infinity);
  if (p.kind === "price" || p.kind === "percent") {
    for (const [i, u] of take(covered)) cost[i]! += u * (p.kind === "price" ? p.amount : price(i) * (1 - p.amount / 100));
  } else {
    for (let sets = Math.floor(covered / p.minQty + EPS); sets > 0; sets--) {
      const set = take(p.minQty);
      const shelf = set.reduce((a, [i, u]) => a + u * price(i), 0);
      const setCost =
        p.kind === "bundle" ? p.amount : p.kind === "nth" ? shelf - (price(set.at(-1)![0]) * p.amount) / 100 : Math.max(0, shelf - p.amount);
      if (setCost >= shelf - EPS) {
        for (const [i, u] of set) left[i]! += u; // the most expensive set saves nothing, so no later one does
        break;
      }
      for (const [i, u] of set) cost[i]! += (setCost * u * price(i)) / shelf;
    }
  }
  return cost.map((c, i) => c + left[i]! * price(i));
}

/** Unrounded cost per line of one choice of options: lines that chose the same Promotion pool their units. */
function costs(chosen: Chosen[]) {
  const out = new Map<number, number>();
  const pools = new Map<string, Chosen[]>();
  for (const c of chosen) {
    if (c.option.promo) pools.set(c.option.promo.id, [...(pools.get(c.option.promo.id) ?? []), c]);
    else out.set(c.line, c.option.price * c.option.quantity);
  }
  for (const pool of pools.values()) poolCosts(pool[0]!.option.promo!, pool).forEach((v, i) => out.set(pool[i]!.line, v));
  return { out, pools };
}

const shekels = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? `₪${Math.round(n)}` : `₪${n.toFixed(2)}`);

const weight = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} גרם` : `${kg} ק״ג`);

/**
 * Hebrew-first text built from the reward ("3 ב-₪10", "2+1", "₪4.90 במקום ₪6.90"; weighed: "2 ק״ג ב-₪80",
 * "250 גרם ב-₪22", "₪29.90 לק״ג"); the app builds its own from the fields.
 */
function textOf(p: RunningPromotion, price: number) {
  switch (p.kind) {
    case "bundle":
      return `${p.weighted ? weight(p.minQty) : p.minQty} ב-${shekels(p.amount)}`;
    case "percent":
      return `${p.amount}% הנחה`;
    case "nth":
      return p.amount === 100 ? `${p.minQty - 1}+1` : `בקניית ${p.minQty}, אחד ב-${p.amount}% הנחה`;
    case "off":
      return `${shekels(p.amount)} הנחה${p.minQty > 1 ? ` בקניית ${p.minQty}` : ""}`;
    case "price":
      return p.weighted ? `${shekels(p.amount)} לק״ג` : `${shekels(p.amount)} במקום ${shekels(price)}`;
    case "info": // never applied: priceLines takes info-only options out first
      return p.description;
  }
}
const applied = (p: RunningPromotion, price: number) => ({ id: p.id, kind: p.kind, minQty: p.minQty, amount: p.amount, audience: p.audience, text: textOf(p, price) });
export type AppliedPromotion = ReturnType<typeof applied>;

// shortcut: past this many combinations in one group of linked lines, a local search replaces the exhaustive one;
// it can miss the lowest total. Only a List with many items on the same overlapping Promotions gets there.
const MAX_COMBINATIONS = 4096;

/** The option index per line, in `group`, with the lowest total. */
function cheapest(lines: LineOption[][], group: number[]) {
  const total = (pick: number[]) => [...costs(group.map((l, j) => ({ line: l, option: lines[l]![pick[j]!]! }))).out.values()].reduce((a, b) => a + b, 0);
  const sizes = group.map((l) => lines[l]!.length);
  let best = group.map(() => 0);
  let bestTotal = total(best);
  if (sizes.reduce((a, b) => a * b, 1) <= MAX_COMBINATIONS) {
    for (const pick = [...best]; ; ) {
      let j = 0;
      while (j < pick.length && ++pick[j]! === sizes[j]) pick[j++] = 0;
      if (j === pick.length) return best;
      const t = total(pick);
      if (t < bestTotal - EPS) [best, bestTotal] = [[...pick], t];
    }
  }
  // Local search from no Promotions and from each Promotion taken by every line it covers.
  const ids = new Set(group.flatMap((l) => lines[l]!.flatMap((o) => (o.promo ? [o.promo.id] : []))));
  const starts = [best, ...[...ids].map((id) => group.map((l) => Math.max(0, lines[l]!.findIndex((o) => o.promo?.id === id))))];
  for (const pick of starts) {
    let t = total(pick);
    for (let improved = true; improved; ) {
      improved = false;
      for (let j = 0; j < pick.length; j++)
        for (let k = 0; k < sizes[j]!; k++) {
          const was = pick[j]!;
          pick[j] = k;
          const tk = total(pick);
          if (tk < t - EPS) [t, improved] = [tk, true];
          else pick[j] = was;
        }
    }
    if (t < bestTotal - EPS) [best, bestTotal] = [[...pick], t];
  }
  return best;
}

/**
 * Prices a store's List lines. `lines[l]` are line l's options, the no-Promotion one included. Each line takes one option
 * (at most one Promotion per unit); a Promotion pools the units of every line that took it (mix-and-match), and the
 * choice is the one with the lowest total. Line totals are rounded to agorot so the lines on one Promotion add up to
 * its rounded total. `hints` are the line's Promotions it didn't get because the List's Quantity of their products is
 * below their minimum. Info-only Promotions never enter the search: they are listed in the line's `info`. A line's
 * options may be different products (a Product group's members); its `hints` and `info` are the chosen product's.
 */
export function priceLines(withInfo: LineOption[][]) {
  const info = withInfo.map((options) => options.flatMap(({ code, promo: p }) => (p?.kind === "info" ? [{ code, id: p.id, description: p.description }] : [])));
  const lines = withInfo.map((options) => options.filter((o) => o.promo?.kind !== "info"));
  // Lines sharing a Promotion are searched together; the others alone.
  const root = lines.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
  const covering = new Map<string, number[]>();
  lines.forEach((options, l) => options.forEach((o) => o.promo && covering.set(o.promo.id, [...(covering.get(o.promo.id) ?? []), l])));
  for (const ls of covering.values()) for (const l of ls) root[find(l)] = find(ls[0]!);
  const groups = new Map<number, number[]>();
  lines.forEach((_, l) => groups.set(find(l), [...(groups.get(find(l)) ?? []), l]));
  const pick = lines.map(() => 0);
  for (const group of groups.values()) cheapest(lines, group).forEach((k, j) => (pick[group[j]!] = k));

  const chosen = lines.map((options, l) => ({ line: l, option: options[pick[l]!]! }));
  const { out, pools } = costs(chosen);
  const lineTotal = chosen.map((c) => round2(out.get(c.line)!));
  for (const pool of pools.values()) {
    const saving = pool.filter((c) => out.get(c.line)! < c.option.price * c.option.quantity - EPS);
    if (!saving.length) continue;
    const exact = round2(pool.reduce((a, c) => a + out.get(c.line)!, 0));
    const largest = saving.reduce((a, c) => (out.get(c.line)! > out.get(a.line)! ? c : a));
    lineTotal[largest.line] = round2(lineTotal[largest.line]! + exact - pool.reduce((a, c) => a + lineTotal[c.line]!, 0));
  }
  const listQuantity = (id: string) => [...new Set(covering.get(id))].reduce((a, l) => a + lines[l]!.find((o) => o.promo?.id === id)!.quantity, 0);
  return chosen.map(({ option }, l) => {
    const promo = option.promo && out.get(l)! < option.price * option.quantity - EPS ? option.promo : undefined;
    // A hint only for a set Promotion (price and percent have no minimum) that would save something at its minimum.
    const saves = (o: LineOption) => poolCosts(o.promo!, [{ line: 0, option: { ...o, quantity: o.promo!.minQty } }])[0]! < o.price * o.promo!.minQty - EPS;
    const sets = (o: LineOption) => o.promo && o.promo.kind !== "price" && o.promo.kind !== "percent";
    const short = lines[l]!.filter((o) => o.code === option.code && sets(o) && o.promo!.id !== promo?.id && o.promo!.minQty > listQuantity(o.promo!.id) + EPS && saves(o));
    const hints = [...new Map(short.map((o) => [o.promo!.id, applied(o.promo!, o.price)])).values()];
    const shown = info[l]!.flatMap(({ code, ...i }) => (code === option.code ? [i] : []));
    return { option, lineTotal: lineTotal[l]!, ...(promo ? { promotion: applied(promo, option.price) } : {}), ...(hints.length ? { hints } : {}), ...(shown.length ? { info: shown } : {}) };
  });
}
