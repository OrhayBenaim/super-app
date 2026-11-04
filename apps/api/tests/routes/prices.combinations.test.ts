import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestPromotions, ingestStores, readXml } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const OSHER = "7290103152017";
const YOHANANOF = "7290803800003";
const here = { lat: 32.0853, lng: 34.7818 };
const WEDNESDAY = new Date("2026-11-04T12:00:00+02:00");
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const [A, B, C] = ["7290001000001", "7290001000002", "7290001000003"].map(gtin);

// --- builders -------------------------------------------------------------------------------------------------------
const storesXml = (chain: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: [code: string, price: number][]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, price]) => `<Item><ItemCode>${code}</ItemCode><ItemName>מוצר ${code}</ItemName><ManufacturerName></ManufacturerName><UnitQty>יחידות</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

/** One group: a single Promotion with RewardType 1/3/10/2 on its items (flat layout, one group). */
type Flat = { id: string; reward: 1 | 2 | 3 | 10; items: string[]; minQty?: number; price?: number; rate?: number; limit?: number };
/** Two groups: g1 the condition (RewardType 0, buy `n`), g2 the reward on the same codes (RewardType 1 or 10, MinQty 1). */
type Nth = { id: string; items: string[]; n: number; rate: number; condPrice?: number; rewardPrice?: number; minPurchase?: number; reward?: 1 | 10 };
type Promo = Flat | Nth;

const item = (code: string, reward: number, minQty: number, rate: number | "", price: number) =>
  `<PromotionItem><ItemCode>${code}</ItemCode><ItemType>1</ItemType><RewardType>${reward}</RewardType><MinQty>${minQty.toFixed(2)}</MinQty><MaxQty></MaxQty><DiscountRate>${rate}</DiscountRate><DiscountedPrice>${price.toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${price.toFixed(2)}</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem>`;
const group = (gid: number, items: string[], minPurchase: number | "" = "") =>
  `<Group><GroupID>${gid}</GroupID><MinPurchaseAmount>${minPurchase}</MinPurchaseAmount><DiscountType></DiscountType><PromotionItems>${items.join("")}</PromotionItems></Group>`;
const promo = (p: Promo) => {
  const groups =
    "n" in p
      ? group(1, p.items.map((c) => item(c, 0, p.n, "", p.condPrice ?? 0)), p.minPurchase ?? "") +
        group(2, p.items.map((c) => item(c, p.reward ?? 1, 1, p.rate, p.rewardPrice ?? 0)))
      : group(1, p.items.map((c) => item(c, p.reward, p.minQty ?? 1, p.rate ?? "", p.price ?? 0)));
  return `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>מבצע ${p.id}</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-11-30T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays></PromotionDays><RedemptionLimit>${"limit" in p ? (p.limit ?? 0) : 0}</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups>${groups}</Groups></Promotion>`;
};
const promosXml = (chain: string, promos: Promo[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`;

// --- world ----------------------------------------------------------------------------------------------------------
type ChainSetup = { key: string; id: string; items: [string, number][]; promos: Promo[] };
const osher = (items: [string, number][], promos: Promo[] = []): ChainSetup => ({ key: "osher-ad", id: OSHER, items, promos });

type P = { id: string; kind: string; minQty: number; amount: number; audience: string; text: string };
type Line = { code: string; price: number; quantity: number; lineTotal: number; promotion?: P; hints?: P[] };
type Store = { storeId: string; total: number; items: Line[] };

async function world(chains: ChainSetup[], now = WEDNESDAY) {
  const clock = fakeClock(now);
  const deps = buildDeps(loadConfig(), { clock });
  const app = createApp(deps);
  const setPos = deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?");
  chains.forEach((c, i) => {
    ingestStores(deps, c.key, storesXml(c.id));
    ingestPrices(deps, c.key, pricesXml(c.id, c.items), `PriceFull${c.id}-001-001-20261104-000000.xml`);
    ingestPromotions(deps, c.key, promosXml(c.id, c.promos), `PromoFull${c.id}-001-001-20261104-010000.xml`);
    setPos.run(here.lat + 0.0045 * (i + 1), here.lng, c.id);
  });
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "combo@prices.test", password: "password1234", name: "Combo" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const post = (body: unknown, auth = true) =>
    app.request("/api/compare", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) }, body: JSON.stringify(body) });
  const compare = async (items: [string, number][], sort?: "price") => {
    const res = await post({ ...here, items: items.map(([code, quantity]) => ({ code, quantity })), ...(sort ? { sort } : {}) });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: Store[] }).stores;
  };
  /** The first store's lines by code, after checking its total is exactly the sum of its lineTotals. */
  const lines = async (items: [string, number][]) => {
    const [s] = await compare(items);
    expect(s!.total).toBeCloseTo(s!.items.reduce((sum, l) => sum + l.lineTotal, 0), 9);
    const by = (code: string) => s!.items.find((l) => l.code === code)!;
    return { store: s!, by };
  };
  return { deps, post, compare, lines };
}

const p = (id: string, kind: string, minQty: number, amount: number, text: string): P => ({ id, kind, minQty, amount, audience: "all", text });

describe("Compare with mix-and-match Promotions", () => {
  it('"2 ב-₪8" over two products at quantity 1 each shares the bundle in proportion to the Shelf prices', async () => {
    const w = await world([osher([[A, 5.9], [B, 4.9]], [{ id: "200", reward: 10, items: [A, B], minQty: 2, price: 8 }])]);
    const { store, by } = await w.lines([[A, 1], [B, 1]]);
    // 8 * 5.90 / 10.80 = 4.3704 -> 4.37; 8 * 4.90 / 10.80 = 3.6296 -> 3.63
    expect(by(A)).toMatchObject({ price: 5.9, quantity: 1, lineTotal: 4.37, promotion: p("200", "bundle", 2, 8, "2 ב-₪8") });
    expect(by(B)).toMatchObject({ price: 4.9, quantity: 1, lineTotal: 3.63, promotion: p("200", "bundle", 2, 8, "2 ב-₪8") });
    expect(store.total).toBe(8);
  });

  it("three products pool into one bundle", async () => {
    const w = await world([osher([[A, 6], [B, 5], [C, 4]], [{ id: "201", reward: 10, items: [A, B, C], minQty: 3, price: 12 }])]);
    const { store, by } = await w.lines([[A, 1], [B, 1], [C, 1]]);
    // Shelf 15, set 12: 12*6/15 = 4.80, 12*5/15 = 4.00, 12*4/15 = 3.20
    expect([by(A).lineTotal, by(B).lineTotal, by(C).lineTotal]).toEqual([4.8, 4, 3.2]);
    for (const l of store.items) expect(l.promotion?.id).toBe("201");
    expect(store.total).toBe(12);
  });

  it("only some units fit in full sets: the rest pay the Shelf price, split per line", async () => {
    const w = await world([osher([[A, 10], [B, 6]], [{ id: "202", reward: 10, items: [A, B], minQty: 2, price: 12 }])]);
    const { store, by } = await w.lines([[A, 1], [B, 2]]);
    // units 10, 6, 6: set (10, 6) costs 12 -> A 12*10/16 = 7.50, B unit 4.50; the last B unit pays 6, so B = 10.50
    expect(by(A)).toMatchObject({ lineTotal: 7.5, promotion: { id: "202" } });
    expect(by(B)).toMatchObject({ lineTotal: 10.5, quantity: 2, promotion: { id: "202" } });
    expect(store.total).toBe(18);
  });

  it("units beyond full sets across two lines: shares are rounded per line and still add up", async () => {
    const w = await world([osher([[A, 4], [B, 3]], [{ id: "203", reward: 10, items: [A, B], minQty: 3, price: 10 }])]);
    const { store, by } = await w.lines([[A, 2], [B, 2]]);
    // units 4, 4, 3, 3: set (4, 4, 3) = 11 -> 10. A: 10*8/11 = 7.27; B's unit in the set: 2.73, plus its Shelf unit 3 = 5.73
    expect(by(A).lineTotal).toBe(7.27);
    expect(by(B).lineTotal).toBe(5.73);
    expect(store.total).toBe(13);
  });

  it("a RedemptionLimit caps the units the pool covers; the most expensive units get it first", async () => {
    const w = await world([osher([[A, 5.9], [B, 4.9]], [{ id: "204", reward: 10, items: [A, B], minQty: 2, price: 8, limit: 2 }])]);
    const { store, by } = await w.lines([[A, 2], [B, 2]]);
    // covered: the two A units (set 8 instead of 11.80); both B units pay 4.90
    expect(by(A)).toMatchObject({ lineTotal: 8, promotion: { id: "204" } });
    expect(by(B)).toMatchObject({ lineTotal: 9.8 });
    expect(by(B)).not.toHaveProperty("promotion");
    expect(by(B)).not.toHaveProperty("hints");
    expect(store.total).toBe(17.8);
  });
});

describe("Compare with nth Promotions (1+1, 2+1, a share off the next)", () => {
  const twoPlusOne: Nth = { id: "210", items: [A], n: 2, rate: 100 };

  it('"2+1" on one product: the cheapest of every 3 is free', async () => {
    const w = await world([osher([[A, 10]], [twoPlusOne])]);
    const three = (await w.lines([[A, 3]])).by(A);
    expect(three).toMatchObject({ price: 10, quantity: 3, lineTotal: 20, promotion: p("210", "nth", 3, 100, "2+1") });
    expect((await w.lines([[A, 4]])).by(A).lineTotal).toBe(30); // one set (20) + one unit beyond it
    expect((await w.lines([[A, 6]])).by(A).lineTotal).toBe(40); // two sets
  });

  it("quantity 2 of a 2+1 does not reach it: Shelf total and a hint", async () => {
    const w = await world([osher([[A, 10]], [twoPlusOne])]);
    const l = (await w.lines([[A, 2]])).by(A);
    expect(l).toMatchObject({ quantity: 2, lineTotal: 20 });
    expect(l).not.toHaveProperty("promotion");
    expect(l.hints).toEqual([p("210", "nth", 3, 100, "2+1")]);
  });

  it('"2+1" across products: the cheapest unit of the set is free, the cost is split over the lines', async () => {
    const w = await world([osher([[A, 10], [B, 6], [C, 8]], [{ id: "211", items: [A, B, C], n: 2, rate: 100 }])]);
    const { store, by } = await w.lines([[A, 1], [B, 1], [C, 1]]);
    // units 10, 8, 6: B is free, set costs 18 -> A 18*10/24 = 7.50, C 6.00, B 4.50
    expect([by(A).lineTotal, by(C).lineTotal, by(B).lineTotal]).toEqual([7.5, 6, 4.5]);
    expect(store.total).toBe(18);
  });

  it("2+1 across two lines where one has two units", async () => {
    const w = await world([osher([[A, 10], [B, 6]], [{ id: "212", items: [A, B], n: 2, rate: 100 }])]);
    const { store, by } = await w.lines([[A, 1], [B, 2]]);
    // units 10, 6, 6: one B free, set costs 16 -> A 16*10/22 = 7.27, B 16*12/22 = 8.73
    expect(by(A).lineTotal).toBe(7.27);
    expect(by(B).lineTotal).toBe(8.73);
    expect(store.total).toBe(16);
  });

  it('"1+1": the second is free', async () => {
    const w = await world([osher([[A, 12]], [{ id: "213", items: [A], n: 1, rate: 100 }])]);
    expect((await w.lines([[A, 2]])).by(A)).toMatchObject({ lineTotal: 12, promotion: p("213", "nth", 2, 100, "1+1") });
    expect((await w.lines([[A, 3]])).by(A).lineTotal).toBe(24);
  });

  it('"the second at 50%": the cheaper unit of every pair gets the share off', async () => {
    const w = await world([osher([[A, 14.9]], [{ id: "214", items: [A], n: 1, rate: 50, rewardPrice: 7.45 }])]);
    const l = (await w.lines([[A, 2]])).by(A);
    expect(l).toMatchObject({ lineTotal: 22.35, promotion: p("214", "nth", 2, 50, "בקניית 2, אחד ב-50% הנחה") });
  });

  it("a condition group that carries the Shelf price is accepted when the reward price agrees", async () => {
    const w = await world([osher([[A, 14.9]], [{ id: "215", items: [A], n: 1, rate: 50, condPrice: 14.9, rewardPrice: 7.45 }])]);
    expect((await w.lines([[A, 2]])).by(A)).toMatchObject({ lineTotal: 22.35, promotion: { id: "215", kind: "nth" } });
  });

  it("a condition price that disagrees with the reward price leaves the Promotion unpriced", async () => {
    const w = await world([osher([[A, 11.9]], [{ id: "216", items: [A], n: 1, rate: 100, condPrice: 11.9, rewardPrice: 5 }])]);
    const l = (await w.lines([[A, 2]])).by(A);
    expect(l.lineTotal).toBe(23.8);
    expect(l).not.toHaveProperty("promotion");
    expect(l).not.toHaveProperty("hints");
  });

  it("a condition group with a MinPurchaseAmount (a basket deal) stays unpriced: no promotion, no hint", async () => {
    const w = await world([osher([[A, 10]], [{ id: "217", items: [A], n: 1, rate: 100, minPurchase: 99 }])]);
    const l = (await w.lines([[A, 1]])).by(A);
    expect(l.lineTotal).toBe(10);
    expect(l).not.toHaveProperty("promotion");
    expect(l).not.toHaveProperty("hints");
    const two = (await w.lines([[A, 2]])).by(A);
    expect(two.lineTotal).toBe(20);
    expect(two).not.toHaveProperty("promotion");
  });

  it("reward RewardType 10 pools like 1", async () => {
    const w = await world([osher([[A, 10]], [{ id: "218", items: [A], n: 1, rate: 100, reward: 10 }])]);
    expect((await w.lines([[A, 2]])).by(A)).toMatchObject({ lineTotal: 10, promotion: { id: "218", kind: "nth" } });
  });
});

describe("Compare: hints for Promotions the Quantity does not reach", () => {
  it('quantity 2 of a "3 ב-₪10": Shelf total, a hint, Quantity unchanged', async () => {
    const w = await world([osher([[A, 4]], [{ id: "220", reward: 1, items: [A], minQty: 3, price: 10 }])]);
    const l = (await w.lines([[A, 2]])).by(A);
    expect(l).toMatchObject({ price: 4, quantity: 2, lineTotal: 8 });
    expect(l).not.toHaveProperty("promotion");
    expect(l.hints).toEqual([{ id: "220", kind: "bundle", minQty: 3, amount: 10, text: "3 ב-₪10", audience: "all" }]);
  });

  it("a mix whose pooled quantity reaches the Promotion gets no hint", async () => {
    const w = await world([osher([[A, 5.9], [B, 4.9]], [{ id: "221", reward: 10, items: [A, B], minQty: 2, price: 8 }])]);
    const alone = (await w.lines([[A, 1]])).by(A);
    expect(alone.lineTotal).toBe(5.9);
    expect(alone.hints).toEqual([p("221", "bundle", 2, 8, "2 ב-₪8")]);
    const { by } = await w.lines([[A, 1], [B, 1]]);
    expect(by(A)).not.toHaveProperty("hints");
    expect(by(B)).not.toHaveProperty("hints");
  });

  it("a line without any Promotion has no hints property", async () => {
    const w = await world([osher([[A, 4], [C, 3]], [{ id: "222", reward: 1, items: [A], minQty: 3, price: 10 }])]);
    const l = (await w.lines([[A, 1], [C, 1]])).by(C);
    expect(l).toMatchObject({ lineTotal: 3 });
    expect(l).not.toHaveProperty("hints");
    expect(l).not.toHaveProperty("promotion");
  });

  it("a Promotion that would only cost more is not a hint", async () => {
    const w = await world([osher([[A, 7]], [{ id: "223", reward: 1, items: [A], minQty: 3, price: 25 }])]);
    const l = (await w.lines([[A, 2]])).by(A);
    expect(l.lineTotal).toBe(14);
    expect(l).not.toHaveProperty("hints");
  });

  it("an applied line still hints a bigger Promotion it does not reach; a losing one it does reach is no hint", async () => {
    const w = await world([
      osher([[A, 10]], [
        { id: "224", reward: 3, items: [A], price: 8 },
        { id: "225", reward: 1, items: [A], minQty: 3, price: 21 },
        { id: "226", reward: 2, items: [A], rate: 10 },
      ]),
    ]);
    // qty 2: 224 -> 16 beats 226 -> 18 and 225 (not reached)
    const l = (await w.lines([[A, 2]])).by(A);
    expect(l).toMatchObject({ lineTotal: 16, promotion: { id: "224" } });
    expect(l.hints).toEqual([p("225", "bundle", 3, 21, "3 ב-₪21")]);
  });
});

describe("Compare picks the lowest store total, at most one Promotion per line", () => {
  it("two Promotions competing for one product: the one that gives the lowest total, per quantity", async () => {
    const w = await world([
      osher([[A, 10]], [
        { id: "300", reward: 3, items: [A], price: 8 },
        { id: "301", reward: 1, items: [A], minQty: 2, price: 14 },
      ]),
    ]);
    const one = (await w.lines([[A, 1]])).by(A);
    expect(one).toMatchObject({ lineTotal: 8, promotion: { id: "300" } });
    expect(one.hints).toEqual([p("301", "bundle", 2, 14, "2 ב-₪14")]);
    const two = (await w.lines([[A, 2]])).by(A);
    expect(two).toMatchObject({ lineTotal: 14, promotion: { id: "301" } });
    expect(two).not.toHaveProperty("hints");
  });

  it("the best combination is not each line's own cheapest", async () => {
    const w = await world([
      osher([[A, 6], [B, 6]], [
        { id: "310", reward: 10, items: [A, B], minQty: 2, price: 8 },
        { id: "311", reward: 3, items: [A], price: 3 }, // A's own cheapest alone: 3 < its share 4 of the mix
      ]),
    ]);
    const { store, by } = await w.lines([[A, 1], [B, 1]]);
    // A:311 + B at Shelf = 9; both on the mix = 8
    expect(by(A)).toMatchObject({ lineTotal: 4, promotion: { id: "310" } });
    expect(by(B)).toMatchObject({ lineTotal: 4, promotion: { id: "310" } });
    expect(store.total).toBe(8);
  });

  it("each of A and B alone does not reach the mix, together they do", async () => {
    const w = await world([osher([[A, 5.9], [B, 4.9]], [{ id: "320", reward: 10, items: [A, B], minQty: 2, price: 8 }])]);
    expect((await w.lines([[A, 1]])).store.total).toBe(5.9);
    expect((await w.lines([[A, 1], [B, 1]])).store.total).toBe(8);
  });

  it("stores sort by the totals after Promotions", async () => {
    const w = await world([
      { key: "yohananof", id: YOHANANOF, items: [[A, 5], [B, 4.5]], promos: [] }, // total 9.50, nearer
      osher([[A, 5.9], [B, 4.9]], [{ id: "330", reward: 10, items: [A, B], minQty: 2, price: 8 }]), // Shelf 10.80, total 8
    ]);
    const stores = await w.compare([[A, 1], [B, 1]], "price");
    expect(stores.map((s) => s.storeId.split("-")[0])).toEqual([OSHER, YOHANANOF]);
    expect(stores.map((s) => s.total)).toEqual([8, 9.5]);
  });

  it("requires a signed-in User", async () => {
    const w = await world([osher([[A, 6.9]])]);
    const res = await w.post({ ...here, items: [{ code: A, quantity: 1 }] }, false);
    expect(res.status).toBe(401);
  });
});

describe("Compare with multi-unit Promotions from real Yohananof files (downloaded 2026-11-04)", () => {
  const fx = (f: string) => readXml(fileURLToPath(new URL(`../__fixtures__/real/${f}`, import.meta.url)));
  // Promotion 371827 "1+1": g1 RT0 qty 1 price 11.90, g2 RT1 rate 100 price 0, on these three, each 11.90.
  const [bagel1, bagel2] = ["7290017928159", "7290017928463"];

  async function yohananof() {
    const w = await world([], new Date("2026-11-04T15:00:00+02:00"));
    ingestStores(w.deps, "yohananof", fx("yohananof-stores.xml"));
    ingestPrices(w.deps, "yohananof", fx("promos/yohananof/PriceFull7290803800003-000-001-20261104-004032.gz"), "PriceFull7290803800003-000-001-20261104-004032.gz");
    ingestPromotions(w.deps, "yohananof", fx("promos/yohananof/PromoFull7290803800003-000-001-20261104-004032.gz"), "PromoFull7290803800003-000-001-20261104-004032.gz");
    ingestPromotions(w.deps, "yohananof", fx("promos/yohananof/Promo7290803800003-000-001-20261104-134000.gz"), "Promo7290803800003-000-001-20261104-134000.gz");
    w.deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, YOHANANOF);
    return w;
  }

  it("1+1: two of one product cost one", async () => {
    const w = await yohananof();
    expect((await w.lines([[bagel1, 2]])).by(bagel1)).toMatchObject({
      price: 11.9,
      quantity: 2,
      lineTotal: 11.9,
      promotion: { id: "371827", kind: "nth", minQty: 2, amount: 100, text: "1+1" },
    });
  });

  it("1+1 across two of its products: one each costs one, split in half", async () => {
    const w = await yohananof();
    const { store, by } = await w.lines([[bagel1, 1], [bagel2, 1]]);
    expect(by(bagel1)).toMatchObject({ lineTotal: 5.95, promotion: { id: "371827" } });
    expect(by(bagel2)).toMatchObject({ lineTotal: 5.95, promotion: { id: "371827" } });
    expect(store.total).toBe(11.9);
  });
});
