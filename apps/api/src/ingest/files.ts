// Price-file names and contents, as every portal publishes them (docs/research/price-data.md section 1).
import type { PriceFile } from "#/services/price-portal.ts";

export type ParsedName = { type: string; key: string; ts: string };

/** "PriceFull7290058140886-001-039-20261101-001003.gz" and "pricefull7290058140886-039-202611010514.gz" -> type, store key, timestamp. */
export function parseFileName(name: string): ParsedName | null {
  const m = /^([a-z]+)(\d[\d-]*?)-(\d{8})-?(\d{3,6})(?:\.|$)/i.exec(name);
  return m ? { type: m[1]!.toLowerCase(), key: m[2]!, ts: m[3]! + m[4]!.padEnd(6, "0") } : null;
}

/**
 * Newest Stores file plus the newest PriceFull of the first `maxStores` stores (by file key), only for `chainIds`
 * (Keshet's account also lists a 2024 Carrefour file).
 */
export function pickFiles(files: PriceFile[], maxStores: number, chainIds: string[]) {
  const newest = new Map<string, PriceFile & ParsedName>();
  for (const f of files) {
    const p = parseFileName(f.name);
    if (!p || (p.type !== "stores" && p.type !== "pricefull") || !chainIds.some((id) => p.key.startsWith(id))) continue;
    const k = p.type === "stores" ? "stores" : p.key;
    if ((newest.get(k)?.ts ?? "") < p.ts) newest.set(k, { ...f, ...p });
  }
  const stores = newest.get("stores");
  newest.delete("stores");
  const prices = [...newest.keys()].sort().slice(0, maxStores).map((k) => newest.get(k)!);
  return { stores, prices };
}

/** Rejects HTML login pages and redirect stubs: a price file is gzip, zip, or XML (optionally with a BOM). */
export function looksLikePriceFile(buf: Uint8Array) {
  const head = Buffer.from(buf.subarray(0, 64)).toString("latin1").replace(/^\xEF\xBB\xBF|^\xFF\xFE|^\xFE\xFF/, "").replace(/\0/g, "");
  return (buf[0] === 0x1f && buf[1] === 0x8b) || (buf[0] === 0x50 && buf[1] === 0x4b) || /^\s*<(\?xml|(?!html[\s>])[a-z][\w:.-]*[\s>])/i.test(head);
}
