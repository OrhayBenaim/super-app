// Parses Israeli Price Transparency files (docs/research/price-data.md sections 2-3).
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";
import { cbsLocality } from "#/ingest/localities.ts";

export type Node = Record<string, any>;

/** Decompresses by magic bytes (gzip, zip named .gz) and decodes by BOM (UTF-16LE/BE, UTF-8). */
export function decodeXml(buf: Buffer): string {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  else if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const first = Object.values(unzipSync(buf))[0];
    if (!first) throw new Error("empty zip");
    buf = Buffer.from(first);
  }
  const enc =
    buf[0] === 0xff && buf[1] === 0xfe ? "utf-16le" : buf[0] === 0xfe && buf[1] === 0xff ? "utf-16be" : buf[1] === 0 ? "utf-16le" : "utf-8";
  return new TextDecoder(enc).decode(buf); // strips the BOM
}

/** Rejects HTML login pages and redirect stubs: a price file is gzip, zip, or XML (optionally with a BOM). */
export function looksLikePriceFile(buf: Uint8Array) {
  const head = Buffer.from(buf.subarray(0, 64)).toString("latin1").replace(/^\xEF\xBB\xBF|^\xFF\xFE|^\xFE\xFF/, "").replace(/\0/g, "");
  return (buf[0] === 0x1f && buf[1] === 0x8b) || (buf[0] === 0x50 && buf[1] === 0x4b) || /^\s*<(\?xml|(?!html[\s/>])[a-z][\w:.-]*[\s/>])/i.test(head);
}

// Tags are lower-cased so ChainId/ChainID, Root/root, Item/item all match. Values stay strings ("034", long barcodes).
// shortcut: builds the whole tree (~10 MB files are fine); switch to a SAX stream if files reach hundreds of MB.
const parser = new XMLParser({
  ignoreDeclaration: true,
  parseTagValue: false,
  htmlEntities: true, // real addresses contain "&#x0D;"; without this numeric entities stay literal
  transformTagName: (n) => n.toLowerCase(),
  isArray: (n) => ["subchain", "store", "item", "product"].includes(n),
});

function root(xml: string): Node {
  const doc = parser.parse(xml) as Node;
  const r = Object.values(doc).find((v) => v && typeof v === "object");
  if (!r) throw new Error("no XML root element");
  return r;
}

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// Real files fill blanks with "לא ידוע" / "Unknown" / "unknown", or bare punctuation: "," (Keshet, Stop Market), "---" (Shufersal).
const known = (v: unknown) => (/^(לא ידוע|unknown)$/i.test(str(v)) || !/[\p{L}\p{N}]/u.test(str(v)) ? "" : str(v));
export const id = (v: unknown) => str(v).replace(/^0+(?=\d)/, ""); // "034" and "34" are the same store
export const num = (v: unknown) => {
  const n = Number(str(v));
  return str(v) === "" || !Number.isFinite(n) ? null : n;
};
export const isWeighted = (v: unknown) => /^(1|true)$/i.test(str(v));

// "0" means unknown; a code CBS doesn't list stays numeric, which the geocoder counts as no town.
const cityName = (v: unknown) => {
  const c = str(v);
  return c === "0" ? "" : Object.hasOwn(cbsLocality, c) ? cbsLocality[c]! : c;
};

export type ParsedStore = { storeId: string; subChainId: string; name: string; address: string; city: string };

export function parseStores(xml: string): { chainId: string; stores: ParsedStore[] } {
  const r = root(xml);
  const subChains: Node[] = r.subchains?.subchain ?? [r]; // legacy files list stores without SubChains
  const stores = subChains.flatMap((sc) =>
    ((sc.stores?.store ?? sc.store ?? []) as Node[]).map((s) => ({
      storeId: id(s.storeid),
      subChainId: id(s.subchainid ?? sc.subchainid),
      name: str(s.storename),
      address: known(s.address),
      city: cityName(s.city),
    })),
  );
  return { chainId: id(r.chainid), stores: stores.filter((s) => s.storeId) };
}

/**
 * A GS1 barcode (EAN-8, UPC-12, EAN-13, GTIN-14): digits only with a valid mod-10 check digit. 11 digits is a UPC-12
 * whose leading 0 the chain dropped (Shufersal and Tiv Taam both publish "10900302814").
 */
export function isGtin(code: string) {
  if (!/^(\d{8}|\d{11,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 ? 1 : 3), 0); // weight 3 next to the check digit
  return (10 - (sum % 10)) % 10 === check;
}

export type ParsedItem = {
  code: string;
  name: string;
  manufacturer: string | null;
  unitQty: string | null;
  isWeighted: boolean;
  price: number;
  unitPrice: number | null;
  /** `ItemStatus` 0: an update file's way of saying the store no longer sells it (such rows may carry no price). */
  removed: boolean;
};

export function parsePrices(xml: string): { chainId: string; storeId: string; items: ParsedItem[] } {
  const r = root(xml);
  const list: Node = r.items ?? r.products ?? r.details ?? r; // Tiv Taam NewDataSet has rows directly under the root
  const items: ParsedItem[] = [];
  for (const it of (list.item ?? list.product ?? []) as Node[]) {
    const code = str(it.itemcode);
    const price = num(it.itemprice);
    const removed = num(it.itemstatus) === 0;
    if (!code || (price === null && !removed)) continue;
    const unit = known(it.unitqty);
    items.push({
      code,
      name: str(it.itemname ?? it.itemnm) || code,
      manufacturer: known(it.manufacturername ?? it.manufacturename) || null,
      unitQty: unit ? [num(it.quantity), unit].filter(Boolean).join(" ") : null, // "200" without a unit means nothing
      isWeighted: isWeighted(it.bisweighted),
      price: price ?? 0, // a removed row without a price; the full-file rule (price > 0) drops it
      unitPrice: num(it.unitofmeasureprice),
      removed,
    });
  }
  return { chainId: id(r.chainid), storeId: id(r.storeid), items };
}
