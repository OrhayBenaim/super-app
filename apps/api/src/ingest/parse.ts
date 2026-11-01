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

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// Real files fill blanks with "לא ידוע" / "Unknown" / "unknown", or bare punctuation: "," (Keshet, Stop Market), "---" (Shufersal).
const known = (v: unknown) => (/^(לא ידוע|unknown)$/i.test(str(v)) || !/[\p{L}\p{N}]/u.test(str(v)) ? "" : str(v));
const id = (v: unknown) => str(v).replace(/^0+(?=\d)/, ""); // "034" and "34" are the same store
const num = (v: unknown) => {
  const n = Number(str(v));
  return str(v) === "" || !Number.isFinite(n) ? null : n;
};

// CBS locality codes, the most common City values in real Stores files (2026-11-01), each checked against store names.
// shortcut: other codes stay numeric ("0" = unknown becomes ""); load the full CBS list when that matters.
const cbsCity: Record<string, string> = {
  "5000": "תל אביב", "4000": "חיפה", "3000": "ירושלים", "7900": "פתח תקווה", "7400": "נתניה", "9000": "באר שבע",
  "70": "אשדוד", "8300": "ראשון לציון", "6900": "כפר סבא", "8600": "רמת גן", "6600": "חולון", "6500": "חדרה",
  "6300": "גבעתיים", "8700": "רעננה", "6400": "הרצליה", "6200": "בת ים", "7100": "אשקלון", "6100": "בני ברק",
  "9700": "הוד השרון", "8400": "רחובות", "2610": "בית שמש", "2600": "אילת", "7700": "עפולה", "1200": "מודיעין",
  "9500": "קריית ביאליק", "8200": "קריית מוצקין", "2640": "ראש העין", "2620": "קריית אונו", "1139": "כרמיאל",
  "9400": "יהוד", "6800": "קריית אתא", "2660": "יבנה", "2650": "רמת השרון", "1247": "חריש", "2530": "באר יעקב",
  "2630": "קריית גת", "6700": "טבריה", "7200": "נס ציונה", "7600": "עכו", "9100": "נהריה",
  // Seen in Carrefour's and Shufersal's Stores files (2026-11-01); without them Nominatim got street + chain-branded name.
  "8500": "רמלה", "7000": "לוד", "7800": "פרדס חנה-כרכור", "2800": "קריית שמונה", "2400": "אור יהודה", "1020": "אור עקיבא",
  "2560": "ערד", "2200": "דימונה", "31": "אופקים", "246": "נתיבות", "1031": "שדרות", "9200": "בית שאן", "874": "מגדל העמק",
  "9300": "זכרון יעקב", "8000": "צפת", "2300": "קריית טבעון", "1063": "מעלות-תרשיחא", "154": "תל מונד", "240": "יקנעם עילית",
  "168": "כפר יונה", "1304": "שוהם", "1309": "אלעד", "2100": "טירת כרמל", "2500": "נשר", "2550": "גדרה", "28": "מזכרת בתיה",
  "3570": "אריאל", "494": "דאלית אל-כרמל", "53": "עתלית", "681": "גבעת שמואל", "166": "גן יבנה", "182": "אבן יהודה",
  "1015": "מבשרת ציון", "1161": "רהט", "3616": "מעלה אדומים", "4100": "קצרין", "831": "ירוחם", "99": "מצפה רמון",
};
const cityName = (v: unknown) => (str(v) === "0" ? "" : (cbsCity[str(v)] ?? str(v)));

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
};

export function parsePrices(xml: string): { chainId: string; storeId: string; items: ParsedItem[] } {
  const r = root(xml);
  const list: Node = r.items ?? r.products ?? r.details ?? r; // Tiv Taam NewDataSet has rows directly under the root
  const items: ParsedItem[] = [];
  for (const it of (list.item ?? list.product ?? []) as Node[]) {
    const code = str(it.itemcode);
    const price = num(it.itemprice);
    if (!code || price === null) continue;
    const unit = known(it.unitqty);
    items.push({
      code,
      name: str(it.itemname ?? it.itemnm) || code,
      manufacturer: known(it.manufacturername ?? it.manufacturename) || null,
      unitQty: unit ? [num(it.quantity), unit].filter(Boolean).join(" ") : null, // "200" without a unit means nothing
      isWeighted: /^(1|true)$/i.test(str(it.bisweighted)),
      price,
      unitPrice: num(it.unitofmeasureprice),
    });
  }
  return { chainId: id(r.chainid), storeId: id(r.storeid), items };
}
