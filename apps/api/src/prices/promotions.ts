// Promotions applied at Compare time (docs/adr/0003): per store, the combination of running Promotions with the lowest total.
import type { Audience, PromotionKind } from "#/db/appSchema.ts";
import type { Db } from "#/db/index.ts";

/** One row per product a Promotion covers: rows sharing `id` (at one store) are one Promotion whose units pool. */
export type RunningPromotion = {
  storeId: string;
  code: string;
  id: string; // the Chain's PromotionID, so lines sharing a Promotion can name it
  kind: PromotionKind; // info: shown with its description, never in a total
  description: string;
  minQty: number;
  amount: number;
  audience: Audience;
  limitQty: number | null;
  weighted: 0 | 1; // the product is weighed, so Quantity, minQty and limitQty are kilos
  minPurchase: number | null; // a spend deal: counts only when the rest of the List costs this much
};
/** What a Promotion gives, whatever store and product it is on. */
export type PromotionTerms = Omit<RunningPromotion, "storeId" | "code">;

const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" });
/** The Israeli weekday of `d` as promotion files number it (`days`): 1 = Sunday ... 7 = Saturday. */
const jerusalemWeekday = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday.format(d)) + 1;

/** Whether a Promotion runs at `now`, as runningPromotions selects them: `days` is the file's list ("1,6") or null. */
export function runningAt(now: Date) {
  const t = now.getTime();
  const day = `,${jerusalemWeekday(now)},`;
  return (p: { startsAt: number; endsAt: number; days: string | null }) => p.startsAt <= t && p.endsAt > t && (p.days === null || `,${p.days},`.includes(day));
}

/** A Promotion's state on the Internal dashboard, in the order it lists them. */
export const PROMOTION_STATES = ["running", "notToday", "future", "ended"] as const;
export type PromotionState = (typeof PROMOTION_STATES)[number];

/** running, ended and future as Compare decides (runningAt); notToday: within its dates, but not on today's weekday. */
export function promotionStateAt(now: Date) {
  const running = runningAt(now);
  const t = now.getTime();
  return ({ startsAt, endsAt, days }: { startsAt: Date; endsAt: Date; days: string | null }): PromotionState => {
    const p = { startsAt: startsAt.getTime(), endsAt: endsAt.getTime(), days };
    return running(p) ? "running" : p.endsAt <= t ? "ended" : p.startsAt > t ? "future" : "notToday";
  };
}

/** The Promotions on `codes` at `storeIds` running at `now` (start, end, Israeli weekday), by `${storeId} ${code}`. */
export function runningPromotions(db: Db, storeIds: string[], codes: string[], now: Date) {
  const rows = db.$client
    .prepare(
      `SELECT p.store_id AS storeId, pi.code, p.promotion_id AS id, p.kind, p.description, p.min_qty AS minQty, p.amount, p.audience, p.limit_qty AS limitQty,
         p.min_purchase AS minPurchase, COALESCE(pr.is_weighted, 0) AS weighted
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
export const round2 = (n: number) => Math.round(n * 100) / 100;
/** Priced in full sets of `minQty` (price and percent apply per unit). */
const isSetKind = (p: PromotionTerms) => p.kind === "bundle" || p.kind === "nth" || p.kind === "off";

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
  if (!isSetKind(p)) {
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
  const cost = new Map<number, number>();
  const pools = new Map<string, Chosen[]>();
  for (const c of chosen) {
    if (c.option.promo) pools.set(c.option.promo.id, [...(pools.get(c.option.promo.id) ?? []), c]);
    else cost.set(c.line, c.option.price * c.option.quantity);
  }
  for (const pool of pools.values()) poolCosts(pool[0]!.option.promo!, pool).forEach((v, i) => cost.set(pool[i]!.line, v));
  return { cost, pools };
}

const shekels = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? `₪${Math.round(n)}` : `₪${n.toFixed(2)}`);

const weight = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} גרם` : `${kg} ק״ג`);

/**
 * Hebrew-first text built from the reward ("3 ב-₪10", "2+1", "₪4.90 במקום ₪6.90"; weighed: "2 ק״ג ב-₪80",
 * "250 גרם ב-₪22", "₪29.90 לק״ג"); the app builds its own from the fields. Without a Shelf `price` (a Promotion over
 * several Products), a price deal is its price alone ("₪4.90").
 */
function textOf(p: PromotionTerms, price?: number) {
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
      return p.weighted ? `${shekels(p.amount)} לק״ג` : price === undefined ? shekels(p.amount) : `${shekels(p.amount)} במקום ${shekels(price)}`;
    case "info": // never applied: priceLines takes info-only options out first
      return p.description;
  }
}
/** A Promotion's text as Compare shows it ("3 ב-₪10", "₪4.90 במקום ₪6.90"; info: the Chain's description); see textOf without `shelf`. */
export const promotionText = (p: PromotionTerms, shelf?: number) => textOf(p, shelf) + (p.minPurchase ? ` מעל ${shekels(p.minPurchase)}` : "");
const applied = (p: PromotionTerms, price: number) => ({ id: p.id, kind: p.kind, minQty: p.minQty, amount: p.amount, audience: p.audience, text: promotionText(p, price) });
export type AppliedPromotion = ReturnType<typeof applied>;

/**
 * What one unit (a kilo when weighed) costs on a running Promotion against its Shelf price `shelf`, and the saving in
 * whole percent (never below 0). A set Promotion (3 for ₪10, 2+1, ₪5 off 2) is averaged over its set. Null when no
 * unit price can be worked out: info-only, or a spend deal (it depends on the rest of the List).
 */
export function promotionPrice(p: Omit<PromotionTerms, "weighted" | "id" | "description">, shelf: number) {
  const each = unitPrice(p, shelf);
  return each === null ? null : { price: round2(each), saving: savingOf(each, shelf) };
}

/** The saving in whole percent of a unit price (before rounding) against the Shelf price, never below 0. */
export const savingOf = (each: number, shelf: number) => Math.max(0, Math.round((1 - each / shelf) * 100));

/** promotionPrice's unit price before rounding, without allocating (browse ranks millions of offers per request). */
export function unitPrice(p: Omit<PromotionTerms, "weighted" | "id" | "description">, shelf: number) {
  if (p.kind === "info" || isDeal(p)) return null;
  switch (p.kind) {
    case "price":
      return p.amount;
    case "bundle":
      return p.amount / p.minQty;
    case "percent":
      return shelf * (1 - p.amount / 100);
    case "nth":
      return shelf * (1 - p.amount / 100 / p.minQty);
    case "off":
      return Math.max(0, shelf - p.amount / p.minQty);
  }
}

// shortcut: past this many combinations in one group of linked lines, a local search replaces the exhaustive one;
// it can miss the lowest total. Only a List with many items on the same overlapping Promotions gets there.
const MAX_COMBINATIONS = 4096;

/** The option index per line, in `group`, with the lowest total. */
function cheapest(lines: LineOption[][], group: number[]) {
  const total = (pick: number[]) => [...costs(group.map((l, j) => ({ line: l, option: lines[l]![pick[j]!]! }))).cost.values()].reduce((a, b) => a + b, 0);
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

/** The option index per line with the lowest total: lines sharing a Promotion are searched together, the others alone. */
function search(lines: LineOption[][]) {
  const root = lines.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
  const covering = new Map<string, number[]>();
  lines.forEach((options, l) => options.forEach((o) => o.promo && covering.set(o.promo.id, [...(covering.get(o.promo.id) ?? []), l])));
  for (const ls of covering.values()) for (const l of ls) root[find(l)] = find(ls[0]!);
  const groups = new Map<number, number[]>();
  lines.forEach((_, l) => groups.set(find(l), [...(groups.get(find(l)) ?? []), l]));
  const pick = lines.map(() => 0);
  for (const group of groups.values()) cheapest(lines, group).forEach((k, j) => (pick[group[j]!] = k));
  return lines.map((options, l) => ({ line: l, option: options[pick[l]!]! }));
}

const isDeal = (p?: Pick<PromotionTerms, "minPurchase">) => (p?.minPurchase ?? 0) > 0;

/** The cheapest choice of `priced` options (no info-only ones) with the spend deals that reach their minimum. */
function chooseDeals(priced: LineOption[][]) {
  /** The cheapest choice with the spend deals `on` allowed; undefined when one it takes doesn't reach its minimum. */
  const withDeals = (on: RunningPromotion[]) => {
    const ids = new Set(on.map((d) => d.id));
    const chosen = search(priced.map((options) => options.filter((o) => !isDeal(o.promo) || ids.has(o.promo!.id))));
    const { cost, pools } = costs(chosen);
    const sum = (cs: Chosen[]) => cs.reduce((a, c) => a + cost.get(c.line)!, 0);
    const spentOutside = (id: string) => sum(chosen.filter((c) => !priced[c.line]!.some((o) => o.promo?.id === id)));
    const reached = [...pools].every(([id, [c]]) => !isDeal(c!.option.promo) || spentOutside(id) >= c!.option.promo!.minPurchase! - EPS);
    return reached ? { chosen, cost, pools, total: sum(chosen) } : undefined;
  };
  // Greedy: the spend deals that lower the total on their own, best first, each kept while every kept one still reaches
  // its minimum (a deal lowers what the others' lines cost). shortcut: can miss a better set of deals; a List rarely has many.
  const deals = [...new Map(priced.flat().flatMap((o) => (isDeal(o.promo) ? [[o.promo!.id, o.promo!] as const] : []))).values()];
  let best = withDeals([])!;
  const helping = deals
    .map((d) => ({ d, total: withDeals([d])?.total ?? Infinity }))
    .filter((t) => t.total < best.total - EPS)
    .sort((a, b) => a.total - b.total);
  const on: RunningPromotion[] = [];
  for (const { d } of helping) {
    const r = withDeals([...on, d]);
    if (r && r.total < best.total - EPS) {
      best = r;
      on.push(d);
    }
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
 *
 * A spend deal (`minPurchase`) counts only when the lines not on its products (a group line counts as on them when one
 * of its members is) cost at least its minimum after their own Promotions. It stacks on the other lines' Promotions.
 * Its lines keep their Shelf totals and its saving is in `basket`.
 */
export function priceLines(lines: LineOption[][]) {
  const info = lines.map((options) => options.flatMap(({ code, promo: p }) => (p?.kind === "info" ? [{ code, id: p.id, description: p.description }] : [])));
  const priced = lines.map((options) => options.filter((o) => o.promo?.kind !== "info"));
  const withoutDeals = priced.map((options) => options.filter((o) => !isDeal(o.promo)));
  const { chosen, cost, pools } = chooseDeals(priced);
  const shelf = (c: Chosen) => c.option.price * c.option.quantity;
  const lineTotal = chosen.map((c) => round2(isDeal(c.option.promo) ? shelf(c) : cost.get(c.line)!));
  const basket = [];
  for (const pool of pools.values()) {
    const saving = pool.filter((c) => cost.get(c.line)! < shelf(c) - EPS);
    if (!saving.length) continue;
    const exact = round2(pool.reduce((a, c) => a + cost.get(c.line)!, 0));
    const rounded = pool.reduce((a, c) => a + lineTotal[c.line]!, 0);
    const p = pool[0]!.option.promo!;
    if (isDeal(p)) {
      basket.push({ ...applied(p, pool[0]!.option.price), minPurchase: p.minPurchase!, saving: round2(rounded - exact), codes: pool.map((c) => c.option.code) });
      continue;
    }
    const largest = saving.reduce((a, c) => (cost.get(c.line)! > cost.get(a.line)! ? c : a));
    lineTotal[largest.line] = round2(lineTotal[largest.line]! + exact - rounded);
  }
  const listQuantity = (id: string) => withoutDeals.reduce((a, options) => a + (options.find((o) => o.promo?.id === id)?.quantity ?? 0), 0);
  const result = chosen.map(({ option }, l) => {
    const promo = option.promo && !isDeal(option.promo) && cost.get(l)! < shelf(chosen[l]!) - EPS ? option.promo : undefined;
    // A hint only for a set Promotion (price and percent have no minimum) that would save something at its minimum.
    const saves = (o: LineOption) => poolCosts(o.promo!, [{ line: 0, option: { ...o, quantity: o.promo!.minQty } }])[0]! < o.price * o.promo!.minQty - EPS;
    const short = withoutDeals[l]!.filter((o) => o.code === option.code && o.promo && isSetKind(o.promo) && o.promo!.id !== promo?.id && o.promo!.minQty > listQuantity(o.promo!.id) + EPS && saves(o));
    const hints = [...new Map(short.map((o) => [o.promo!.id, applied(o.promo!, o.price)])).values()];
    const lineInfo = info[l]!.flatMap(({ code, ...i }) => (code === option.code ? [i] : []));
    return { option, lineTotal: lineTotal[l]!, ...(promo ? { promotion: applied(promo, option.price) } : {}), ...(hints.length ? { hints } : {}), ...(lineInfo.length ? { info: lineInfo } : {}) };
  });
  return { lines: result, basket };
}
export type BasketDeal = ReturnType<typeof priceLines>["basket"][number];
