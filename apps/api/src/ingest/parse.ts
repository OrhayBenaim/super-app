// Parses Israeli Price Transparency files (docs/research/price-data.md sections 2-3).
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";
import type { Audience } from "#/prices/promotions.ts";
import { fromJerusalem } from "#/utils/clock.ts";

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
export const id = (v: unknown) => str(v).replace(/^0+(?=\d)/, ""); // "034" and "34" are the same store
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
      isWeighted: /^(1|true)$/i.test(str(it.bisweighted)),
      price: price ?? 0, // a removed row without a price; the full-file rule (price > 0) drops it
      unitPrice: num(it.unitofmeasureprice),
      removed,
    });
  }
  return { chainId: id(r.chainid), storeId: id(r.storeid), items };
}

// Promotion files nest Promotion > Groups > Group > PromotionItems > PromotionItem; a single child must still be an array.
const promoParser = new XMLParser({
  ignoreDeclaration: true,
  parseTagValue: false,
  htmlEntities: true,
  transformTagName: (n) => n.toLowerCase(),
  isArray: (n) => ["promotion", "group", "promotionitem"].includes(n),
});

export type PromotionReward = { kind: "price" | "bundle" | "percent" | "nth" | "off"; minQty: number; amount: number };
// info: information only (a gift, a deal priced only in its description, a reward Grocer can't price), never in a total.
export type ParsedPromotion = (PromotionReward | { kind: "info"; minQty: 0; amount: 0 }) & {
  promotionId: string;
  description: string;
  audience: Audience;
  startsAt: number;
  endsAt: number;
  days: string | null;
  limitQty: number | null;
  minPurchase: number | null; // a spend deal: the rest of the List must cost this much (CONTEXT.md "Promotion")
  combines: boolean; // AllowMultipleDiscounts: whether a spend deal stacks on the rest of the List's Promotions
  codes: string[];
};

const isWeighted = (v: unknown) => /^(1|true)$/i.test(str(v));

/** The reward of a one-group promotion's items, or why it can't be priced yet (later tickets add the other kinds). */
function groupedReward(groupCount: number, items: Node[]): PromotionReward | string {
  if (groupCount !== 1) return `${groupCount} groups`;
  const rewardOf = (i: Node) => [str(i.rewardtype), num(i.minqty), num(str(i.rewardtype) === "2" ? i.discountrate : i.discountedprice), isWeighted(i.bisweighted)].join("|");
  if (!items.length) return "no items";
  if (new Set(items.map(rewardOf)).size > 1) return "items with different rewards";
  const i = items[0]!;
  const type = str(i.rewardtype);
  const [minQty, price, rate] = [num(i.minqty) ?? 0, num(i.discountedprice) ?? 0, num(i.discountrate) ?? 0];
  if (isWeighted(i.bisweighted) && type !== "2") return weightedReward(type, minQty, price);
  if (type === "3" && minQty <= 1 && price > 0) return { kind: "price", minQty: 1, amount: price };
  // 1 = N for a total on one product, 10 = across several (mix and match); DiscountedPrice is the total for MinQty units.
  if ((type === "1" || type === "10") && Number.isInteger(minQty) && minQty >= 1 && price > 0)
    return minQty === 1 ? { kind: "price", minQty: 1, amount: price } : { kind: "bundle", minQty, amount: price };
  // Rate 100 is a gift, free delivery or another product free (real-promos README): never a free line.
  if (type === "2" && minQty <= 1 && rate > 0 && rate < 100) return { kind: "percent", minQty: 1, amount: rate };
  return `RewardType ${type}`;
}

/**
 * "1+1", "2+1", "the second at 50%" (real-promos README surprise 6): group 1 is the condition (RewardType 0, MinQty n,
 * no spend minimum), group 2 gives one more unit of the same products `DiscountRate` % off. Where group 1 carries the
 * Shelf price (Shufersal, Tiv Taam, Yohananof), group 2's DiscountedPrice must agree with the rate (it doesn't on
 * Shufersal's "1+1 at 50%" sets, which discount the whole set). Undefined when the groups say anything else.
 */
function nthReward(rows: Node[], [cond = [], reward = []]: Node[][]): PromotionReward | undefined {
  const codes = (items: Node[]) => [...new Set(items.map((i) => str(i.itemcode)))].sort().join();
  if (rows.some((r) => (num(r.groups.group[0]?.minpurchaseamount) ?? 0) > 0) || !cond.length || codes(cond) !== codes(reward)) return;
  const [n, rate] = [num(cond[0]!.minqty) ?? 0, num(reward[0]!.discountrate) ?? 0];
  const [shelf, price] = [num(cond[0]!.discountedprice) ?? 0, num(reward[0]!.discountedprice) ?? 0];
  if (!Number.isInteger(n) || n < 1 || !(rate > 0 && rate <= 100) || [...cond, ...reward].some((i) => isWeighted(i.bisweighted))) return;
  if (!cond.every((i) => str(i.rewardtype) === "0" && num(i.minqty) === n)) return;
  if (!reward.every((i) => ["1", "10"].includes(str(i.rewardtype)) && num(i.minqty) === 1 && num(i.discountrate) === rate)) return;
  if (shelf > 0 && Math.abs(price - shelf * (1 - rate / 100)) > Math.max(0.05, shelf * 0.006)) return; // rates are rounded
  if (shelf === 0 && rate === 100 && price !== 0) return;
  return { kind: "nth", minQty: n + 1, amount: rate };
}

// A bare club number names no audience and means a different one at each Chain (real files, 2026-11-04): Victory 1 is
// Wolt-only and Machsanei Hashuk 1 employees, so only these are kept. Any other bare number is excluded.
const bareClubs: Record<string, Record<string, Audience>> = {
  victory: { "2": "card" }, // Max Victory card
  "machsanei-hashuk": { "2": "card" }, // W CARD
  "rami-levy": { "2": "card" }, // store 039: "לחברי אשראי"
};

/**
 * Who gets a Promotion, from its ClubID ("0 - כלל הלקוחות", "1=מועדון אונליין", "(2=…אשראי|2=…)", "((…))&(3=…)", "2")
 * and AdditionalIsCoupon; null = excluded (employees, a club tier, an unnamed code such as Keshet's bare "1=").
 */
function audienceOf(chainKey: string, clubId: string, coupon: boolean): Audience | null {
  if (/^0(\D|$)/.test(clubId)) return coupon ? "coupon" : "all";
  const bare = /^\d+$/.test(clubId) ? bareClubs[chainKey]?.[clubId] : undefined;
  const names = [...clubId.matchAll(/\d+\s*[=-]\s*([^|()&]*)/g)].map((m) => m[1]!.trim());
  if (!bare && (!names.length || names.some((n) => !n || /עובד|זהב|פלטינ|V\.?I\.?P/i.test(n)))) return null;
  if (coupon) return "coupon";
  if (bare) return bare;
  // "|" lists alternatives (any one is enough, so a club beats a card); "&" joins conditions (a card one is needed).
  const card = (n: string) => n.includes("אשראי");
  return (clubId.includes("&") ? names.some(card) : names.every(card)) ? "card" : "club";
}

/**
 * A price on an item Sold by weight (Quantity in kilos). MinQty 0.01 marks a per-kilo price, as does 1 (Victory); another
 * weight up to 10 kg means the price of that weight. Other MinQty values (Salach Dabach 200, Stop Market and Dor Alon
 * empty) and a price under ₪1 at 0.01 (Politzer prices 10 g there) can't say per kilo or per pack: info-only.
 */
function weightedReward(type: string, minQty: number, price: number): PromotionReward | string {
  if (!["1", "3", "10"].includes(type)) return `RewardType ${type} weighted`;
  const near = (q: number) => Math.abs(minQty - q) < 1e-6;
  if (price > 0 && ((near(0.01) && price >= 1) || near(1))) return { kind: "price", minQty: 1, amount: price };
  if (price > 0 && minQty > 0.01 + 1e-6 && minQty <= 10) return { kind: "bundle", minQty, amount: price };
  return `weighted MinQty ${minQty}: per kilo or per pack unclear`;
}

const minPurchaseOf = (rows: Node[], g: number) => Math.max(0, ...rows.map((r) => num(r.groups.group[g]?.minpurchaseamount) ?? 0));
/**
 * A spend condition: a group with a MinPurchaseAmount on the whole store (item 0000000000000, RewardType 0) whose other
 * rows (RewardType 12) name the deal's own products, which don't count toward it (Stop Market, Carrefour, Yohananof).
 */
const isSpendCondition = (rows: Node[], items: Node[], g: number) =>
  minPurchaseOf(rows, g) > 0 && items.some((i) => /^0+$/.test(str(i.itemcode))) && items.every((i) => ["0", "12"].includes(str(i.rewardtype)));

const weekdays = (v: unknown) => {
  const days = [...new Set(str(v).split(",").map((d) => d.trim()).filter((d) => /^[1-7]$/.test(d)))].sort().join(",");
  return days === "" || days === "1,2,3,4,5,6,7" ? null : days;
};

/**
 * A promotion file (docs/research/price-data.md section 3c). `layout` is "grouped" when every Promotion nests its items in
 * Groups (grouped-2026, and Shufersal/Carrefour's files, which have the same tags), else "unknown" (nothing parsed).
 * Rows sharing a PromotionID are one Promotion (Victory and Machsanei Hashuk write one row per item).
 * Promotions for an excluded audience are left out; `unpriced` lists the others whose price can't be read yet (returned
 * as info-only when their dates can be read), `ids` every PromotionID in the file.
 */
export function parsePromotions(xml: string, chainKey: string) {
  const doc = promoParser.parse(xml) as Node;
  const r: Node | undefined = Object.values(doc).find((v) => v && typeof v === "object");
  if (!r) throw new Error("no XML root element");
  const rows: Node[] = r.promotions?.promotion ?? [];
  const layout = rows.every((p) => p.groups?.group) ? ("grouped" as const) : ("unknown" as const);
  const byId = new Map<string, Node[]>();
  for (const p of layout === "grouped" ? rows : []) {
    const pid = id(p.promotionid);
    if (pid) byId.set(pid, [...(byId.get(pid) ?? []), p]);
  }
  const promotions: ParsedPromotion[] = [];
  const unpriced: { promotionId: string; kind: string }[] = [];
  for (const [promotionId, [p, ...more]] of byId) {
    const audience = audienceOf(chainKey, str(p!.clubid), num(p!.additionaliscoupon) === 1);
    if (!audience) continue;
    const idRows = [p!, ...more];
    const groupCount = Math.max(...idRows.map((row) => row.groups.group.length));
    const groups = Array.from({ length: groupCount }, (_, g) => idRows.flatMap((row): Node[] => row.groups.group[g]?.promotionitems?.promotionitem ?? []));
    // A spend deal is one group with a minimum, or a spend condition group beside the reward group (either order).
    const cond = groupCount === 2 ? [0, 1].find((g) => isSpendCondition(idRows, groups[g]!, g)) : undefined;
    const items = groups[cond === undefined ? 0 : 1 - cond]!;
    const reward = cond !== undefined ? groupedReward(1, items) : (groupCount === 2 && nthReward(idRows, groups)) || groupedReward(groupCount, items);
    const minPurchase = cond !== undefined ? minPurchaseOf(idRows, cond) : groupCount === 1 ? minPurchaseOf(idRows, 0) : 0;
    const [startsAt, endsAt] = [fromJerusalem(str(p!.promotionstartdatetime)), fromJerusalem(str(p!.promotionenddatetime))];
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
      unpriced.push({ promotionId, kind: "unreadable dates" });
      continue;
    }
    // A reward Grocer can't price is kept as information: shown with the Chain's description, never in a total.
    if (typeof reward === "string") unpriced.push({ promotionId, kind: reward });
    const limit = num(p!.redemptionlimit);
    promotions.push({
      promotionId,
      description: str(p!.promotiondescription),
      ...(typeof reward === "string" ? { kind: "info" as const, minQty: 0, amount: 0 } : reward),
      audience,
      startsAt,
      endsAt,
      days: weekdays(p!.promotiondays),
      limitQty: limit && limit > 0 ? limit : null,
      minPurchase: minPurchase > 0 ? minPurchase : null,
      combines: num(p!.allowmultiplediscounts) !== 0,
      codes: [...new Set(items.map((i) => str(i.itemcode)).filter(Boolean))],
    });
  }
  return { chainId: id(r.chainid), storeId: id(r.storeid), layout, ids: [...byId.keys()], promotions, unpriced };
}
