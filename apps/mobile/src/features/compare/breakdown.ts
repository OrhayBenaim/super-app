// Pure (no RN imports) so vitest can load it.
import { matchKey, type Item } from "@/features/lists/api";
import { lineKey, type StoreResult } from "./sort";

const round2 = (n: number) => Math.round(n * 100) / 100;

type Line = StoreResult["items"][number];

/**
 * The Basket breakdown of one store: a line per on-list item it prices, then the items it doesn't price and the unmatched
 * ones. Each line's total is the server's `lineTotal` (after its Promotion); two items matched to one product (one merged
 * line on the server) show as two, sharing that total by Quantity in agorot that add up exactly (the remainder on the last).
 * `shelfTotal` is the item's Quantity × Shelf price.
 */
export function breakdown(items: Item[], store: Pick<StoreResult, "items">) {
  const lines = new Map(store.items.map((l) => [lineKey(l), l]));
  const keys = items.map((item) => matchKey(item));
  // Per line: the Quantity of its items, how many are still to come and how much of its total they were given so far.
  const share = new Map<string, { quantity: number; left: number; given: number }>();
  keys.forEach((key, i) => {
    if (key === null) return;
    const s = share.get(key) ?? { quantity: 0, left: 0, given: 0 };
    share.set(key, { quantity: s.quantity + items[i].quantity, left: s.left + 1, given: 0 });
  });

  const priced: { item: Item; price: number; lineTotal: number; shelfTotal: number; promotion?: Line["promotion"] }[] = [];
  const notHere: Item[] = [];
  const unmatched: Item[] = [];
  items.forEach((item, i) => {
    const key = keys[i];
    const line = key === null ? undefined : lines.get(key);
    if (key === null || !line) return void (key === null ? unmatched : notHere).push(item);
    const s = share.get(key)!;
    const lineTotal = round2(--s.left === 0 ? line.lineTotal - s.given : (line.lineTotal * item.quantity) / s.quantity);
    s.given += lineTotal;
    priced.push({ item, price: line.price, lineTotal, shelfTotal: round2(line.price * item.quantity), promotion: line.promotion });
  });
  return { priced, notHere, unmatched };
}

/** On-list items this store leaves out of its total, counted per item (its `matched` counts products, not items). */
export const missingCount = (items: Item[], store: Pick<StoreResult, "items">) => items.length - breakdown(items, store).priced.length;
