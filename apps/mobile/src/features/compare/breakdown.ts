// Pure (no RN imports) so vitest can load it.
import { matchKey, type Item } from "@/features/lists/api";
import type { StoreResult } from "./sort";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The Basket breakdown of one store: a line per on-list item it prices (quantity × its price there), then the items it
 * doesn't price and the unmatched ones. Lines come per item, so two items matched to one product (one merged line on
 * the server) show as two.
 */
export function breakdown(items: Item[], store: Pick<StoreResult, "items">) {
  const price = new Map(store.items.map((l) => ["ref" in l ? l.ref : l.code, l.price]));
  const priced: { item: Item; price: number; lineTotal: number }[] = [];
  const notHere: Item[] = [];
  const unmatched: Item[] = [];
  for (const item of items) {
    const key = matchKey(item);
    const p = key === null ? undefined : price.get(key);
    if (p !== undefined) priced.push({ item, price: p, lineTotal: round2(p * item.quantity) });
    else (key === null ? unmatched : notHere).push(item);
  }
  return { priced, notHere, unmatched };
}
