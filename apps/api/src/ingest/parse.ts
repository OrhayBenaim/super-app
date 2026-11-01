// Parses Israeli Price Transparency files (docs/research/price-data.md sections 2-3).
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";

type Node = Record<string, any>;

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

// Tags are lower-cased so ChainId/ChainID, Root/root, Item/item all match. Values stay strings ("034", long barcodes).
// shortcut: builds the whole tree (~10 MB files are fine); switch to a SAX stream if files reach hundreds of MB.
const parser = new XMLParser({
  ignoreDeclaration: true,
  parseTagValue: false,
  transformTagName: (n) => n.toLowerCase(),
  isArray: (n) => ["subchain", "store", "item", "product"].includes(n),
});

function root(xml: string): Node {
  const doc = parser.parse(xml) as Node;
  const r = Object.values(doc).find((v) => v && typeof v === "object");
  if (!r) throw new Error("no XML root element");
  return r;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const id = (v: unknown) => str(v).replace(/^0+(?=\d)/, ""); // "034" and "34" are the same store
const num = (v: unknown) => {
  const n = Number(str(v));
  return str(v) === "" || Number.isNaN(n) ? null : n;
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
      address: str(s.address),
      city: str(s.city),
    })),
  );
  return { chainId: id(r.chainid), stores: stores.filter((s) => s.storeId) };
}

export type ParsedItem = {
  code: string;
  name: string;
  manufacturer: string | null;
  unitQty: string | null;
  isWeighted: boolean;
  price: number;
  unitPrice: number | null;
};

export function parsePrices(xml: string): { chainId: string; storeId: string; items: ParsedItem[] } {
  const r = root(xml);
  const list: Node = r.items ?? r.products ?? r.details ?? r; // Tiv Taam NewDataSet has rows directly under the root
  const items: ParsedItem[] = [];
  for (const it of (list.item ?? list.product ?? []) as Node[]) {
    const code = str(it.itemcode);
    const price = num(it.itemprice);
    if (!code || price === null) continue;
    const qty = num(it.quantity);
    items.push({
      code,
      name: str(it.itemname ?? it.itemnm) || code,
      manufacturer: str(it.manufacturername ?? it.manufacturename) || null,
      unitQty: [qty, str(it.unitqty)].filter(Boolean).join(" ") || null,
      isWeighted: /^(1|true)$/i.test(str(it.bisweighted)),
      price,
      unitPrice: num(it.unitofmeasureprice),
    });
  }
  return { chainId: id(r.chainid), storeId: id(r.storeid), items };
}
