// Parses Israeli Price Transparency promotion files (docs/research/price-data.md section 3c).
import { XMLParser } from "fast-xml-parser";
import type { Audience, PromotionKind } from "#/db/appSchema.ts";
import { id, isWeighted, type Node, num, str } from "#/ingest/parse.ts";

// Promotion files nest Promotion > Groups > Group > PromotionItems > PromotionItem (flat ones PromotionItems > Item and
// Clubs > ClubId); a single child must still be an array.
const promoParser = new XMLParser({
  ignoreDeclaration: true,
  parseTagValue: false,
  htmlEntities: true,
  transformTagName: (n) => n.toLowerCase(),
  isArray: (n, jpath) => ["promotion", "group", "promotionitem", "item"].includes(n) || String(jpath).endsWith("clubs.clubid"),
});

export type PromotionReward = { kind: Exclude<PromotionKind, "info">; minQty: number; amount: number };
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
  combines: boolean; // AllowMultipleDiscounts, stored but not used by Compare yet (appSchema.ts `combines`)
  codes: string[];
};

const jerusalem = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const offsetAt = (t: number) => {
  const p = Object.fromEntries(jerusalem.formatToParts(t).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - (t - (t % 1000));
};

/** Israel wall-clock time without an offset ("2026-11-04T00:00:00.000", "2026-11-03 10:58:00"), as promotion files write it, as an instant; NaN if unreadable. */
function fromJerusalem(local: string) {
  const wall = Date.parse(`${local.trim().replace(" ", "T").slice(0, 19)}Z`);
  if (Number.isNaN(wall)) return NaN;
  return wall - offsetAt(wall - offsetAt(wall)); // the second pass lands on the right side of a daylight-saving change
}

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
  if (type === "1" || type === "10") return nForTotal(minQty, price) ?? `RewardType ${type}`;
  return (type === "2" && percentOff(minQty, rate)) || `RewardType ${type}`;
}

const nForTotal = (minQty: number, price: number): PromotionReward | undefined =>
  Number.isInteger(minQty) && minQty >= 1 && price > 0 ? (minQty === 1 ? { kind: "price", minQty: 1, amount: price } : { kind: "bundle", minQty, amount: price }) : undefined;
// Rate 100 is a gift, free delivery or another product free (real-promos README): never a free line.
const percentOff = (minQty: number, rate: number): PromotionReward | undefined =>
  minQty <= 1 && rate > 0 && rate < 100 ? { kind: "percent", minQty: 1, amount: rate } : undefined;

/**
 * The reward of a flat Promotion (Keshet's 3-segment stores, Rami Levy 039), written on the Promotion itself
 * (price-data.md section 3c): 1 = N for a total, 2 = percent off, 7 and 9 = "N+1" (the cheapest of every MinQty units
 * `DiscountRate` off). `percentUnit` 100 is Keshet's DiscountRate in hundredths of a percent. Seen in every Keshet flat
 * file and Rami Levy 039 on 2026-11-04: 1, 2 and 9 only; 3 (amount off) and 6 never, so they stay info-only until a real
 * one shows which field holds the amount. A spend minimum (`MinPurchaseAmnt`) makes it a spend deal (parsePromotions).
 */
function flatReward(p: Node, percentUnit: number): PromotionReward | string {
  const type = str(p.rewardtype);
  const [minQty, price, rate] = [num(p.minqty) ?? 0, num(p.discountedprice) ?? 0, (num(p.discountrate) ?? 0) / percentUnit];
  // Keshet writes a weighed item's DiscountedPrice per kilo, also for a weight MinQty ("2 ב 69.90": MinQty 2, price 34.95).
  if (isWeighted(p.isweightedpromo) && type !== "2")
    return type === "1" ? weightedReward(type, minQty, minQty > 0.01 + 1e-6 ? Math.round(price * minQty * 100) / 100 : price) : `RewardType ${type} weighted`;
  if (type === "1") return nForTotal(minQty, price) ?? `RewardType ${type}`;
  if (type === "2") return percentOff(minQty, rate) ?? `RewardType ${type}`;
  if ((type === "7" || type === "9") && Number.isInteger(minQty) && minQty >= 2 && rate > 0 && rate <= 100) return { kind: "nth", minQty, amount: rate };
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

const flatDate = (date: unknown, hour: unknown) => `${str(date).slice(0, 10)} ${str(hour) || "00:00:00"}`;

/** A flat Promotion row with its Promotion-level fields under their grouped names. */
const asGrouped = (p: Node): Node => {
  const restrictions: Node = typeof p.additionalrestrictions === "object" ? p.additionalrestrictions : {};
  const clubs: unknown[] = (p.clubs ?? restrictions.clubs)?.clubid ?? [];
  return {
    ...p,
    clubid: clubs.map(str).sort().join("|"), // shortcut: only one ClubId per Promotion seen; "0" sorts first, so any 0 = all
    additionaliscoupon: restrictions.additionaliscoupon,
    promotionstartdatetime: flatDate(p.promotionstartdate, p.promotionstarthour),
    promotionenddatetime: flatDate(p.promotionenddate, p.promotionendhour),
    redemptionlimit: p.maxqty, // MAXQTY at Rami Levy 039; 0 = no limit
  };
};

/**
 * A promotion file (docs/research/price-data.md section 3c). `layout`: "grouped" when every Promotion nests its items in
 * Groups (grouped-2026, and Shufersal/Carrefour's files, which have the same tags); "flat" (Keshet) or "flat-percent"
 * (Rami Levy 039, its `Clubs` inside `AdditionalRestrictions` and DiscountRate in whole percent) when every Promotion
 * carries its reward and items itself; else "unknown" (nothing parsed).
 * Rows sharing a PromotionID are one Promotion (Victory and Machsanei Hashuk write one row per item).
 * Promotions for an excluded audience are left out; `unpriced` lists the others whose price can't be read yet (returned
 * as info-only when their dates can be read), `ids` every PromotionID in the file.
 */
export function parsePromotions(xml: string, chainKey: string) {
  const doc = promoParser.parse(xml) as Node;
  const r: Node | undefined = Object.values(doc).find((v) => v && typeof v === "object");
  if (!r) throw new Error("no XML root element");
  const all: Node[] = r.promotions?.promotion ?? [];
  const layout = all.every((p) => p.groups?.group)
    ? ("grouped" as const)
    : all.every((p) => p.rewardtype !== undefined && p.promotionitems?.item)
      ? all.some((p) => p.additionalrestrictions?.clubs)
        ? ("flat-percent" as const)
        : ("flat" as const)
      : ("unknown" as const);
  const rows = layout === "unknown" ? [] : layout === "grouped" ? all : all.map(asGrouped);
  const byId = new Map<string, Node[]>();
  for (const p of rows) {
    const pid = id(p.promotionid);
    if (pid) byId.set(pid, [...(byId.get(pid) ?? []), p]);
  }
  const promotions: ParsedPromotion[] = [];
  const unpriced: { promotionId: string; reason: string }[] = [];
  for (const [promotionId, [p, ...more]] of byId) {
    const audience = audienceOf(chainKey, str(p!.clubid), num(p!.additionaliscoupon) === 1);
    if (!audience) continue;
    const idRows = [p!, ...more];
    let items: Node[];
    let reward: PromotionReward | string;
    let minPurchase: number;
    if (layout === "grouped") {
      const groupCount = Math.max(...idRows.map((row) => row.groups.group.length));
      const groups = Array.from({ length: groupCount }, (_, g) => idRows.flatMap((row): Node[] => row.groups.group[g]?.promotionitems?.promotionitem ?? []));
      // A spend deal is one group with a minimum, or a spend condition group beside the reward group (either order).
      const cond = groupCount === 2 ? [0, 1].find((g) => isSpendCondition(idRows, groups[g]!, g)) : undefined;
      items = groups[cond === undefined ? 0 : 1 - cond]!;
      reward = cond !== undefined ? groupedReward(1, items) : (groupCount === 2 && nthReward(idRows, groups)) || groupedReward(groupCount, items);
      minPurchase = cond !== undefined ? minPurchaseOf(idRows, cond) : groupCount === 1 ? minPurchaseOf(idRows, 0) : 0;
    } else {
      items = idRows.flatMap((row): Node[] => row.promotionitems.item);
      reward = flatReward(p!, layout === "flat" ? 100 : 1);
      minPurchase = num(p!.minpurchaseamnt) ?? 0;
    }
    const [startsAt, endsAt] = [fromJerusalem(str(p!.promotionstartdatetime)), fromJerusalem(str(p!.promotionenddatetime))];
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
      unpriced.push({ promotionId, reason: "unreadable dates" });
      continue;
    }
    // A reward Grocer can't price is kept as information: shown with the Chain's description, never in a total.
    if (typeof reward === "string") unpriced.push({ promotionId, reason: reward });
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
