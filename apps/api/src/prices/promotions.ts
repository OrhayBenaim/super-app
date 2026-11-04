// Promotions applied at Compare time (docs/adr/0003): per line, the running Promotion that gives the lowest total.
import type { Db } from "#/db/index.ts";
import { jerusalemWeekday } from "#/utils/clock.ts";

export type Audience = "all" | "club" | "card" | "coupon";
export type RunningPromotion = {
  storeId: string;
  code: string;
  id: string; // the Chain's PromotionID, so lines sharing a Promotion can name it
  kind: "price" | "bundle" | "percent" | "info"; // info: shown with its description, never in a total
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

/** What `quantity` units at Shelf price `price` cost with `p`: units above its limit, and beyond full sets, at the Shelf price. */
function costWith(p: RunningPromotion, price: number, quantity: number) {
  const units = Math.min(quantity, p.limitQty ?? Infinity);
  if (p.kind === "bundle") {
    const sets = Math.floor(units / p.minQty + 1e-9); // 0.6 kg / 0.2 kg is 2.999… in floats
    return sets * p.amount + (quantity - sets * p.minQty) * price;
  }
  const each = p.kind === "price" ? p.amount : price * (1 - p.amount / 100);
  return units * each + (quantity - units) * price;
}

const shekels = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? `₪${Math.round(n)}` : `₪${n.toFixed(2)}`);

const weight = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} גרם` : `${kg} ק״ג`);

/**
 * Hebrew-first text built from the reward ("3 ב-₪10", "10% הנחה", "₪4.90 במקום ₪6.90"; weighed: "2 ק״ג ב-₪80",
 * "250 גרם ב-₪22", "₪29.90 לק״ג"); the app builds its own from the fields.
 */
const textOf = (p: RunningPromotion, price: number) =>
  p.kind === "bundle"
    ? `${p.weighted ? weight(p.minQty) : p.minQty} ב-${shekels(p.amount)}`
    : p.kind === "percent"
      ? `${p.amount}% הנחה`
      : p.weighted
        ? `${shekels(p.amount)} לק״ג`
        : `${shekels(p.amount)} במקום ${shekels(price)}`;

/**
 * The lowest total for one line: its Shelf total, or the cheapest of `promos` (at most one Promotion per line). A
 * Promotion that doesn't lower the total, or whose minimum the Quantity doesn't reach, is not applied. Info-only
 * Promotions are listed in `info` and never priced.
 */
export function priceLine(price: number, quantity: number, promos: RunningPromotion[] = []) {
  let total = price * quantity;
  let best: RunningPromotion | undefined;
  const info = promos.filter((p) => p.kind === "info").map(({ id, description }) => ({ id, description }));
  for (const p of promos) {
    if (p.kind === "info") continue;
    const cost = costWith(p, price, quantity);
    if (cost < total - 1e-9) [total, best] = [cost, p];
  }
  const promotion = best && { id: best.id, kind: best.kind, minQty: best.minQty, amount: best.amount, audience: best.audience, text: textOf(best, price) };
  return { total, ...(promotion ? { promotion } : {}), ...(info.length ? { info } : {}) };
}
