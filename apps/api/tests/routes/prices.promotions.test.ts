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
const FRIDAY = new Date("2026-11-06T12:00:00+02:00");
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const [A, B, C] = ["7290001000001", "7290001000002", "7290001000003"].map(gtin);

// --- builders -------------------------------------------------------------------------------------------------------
const storesXml = (chain: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: [code: string, price: number][]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, price]) => `<Item><ItemCode>${code}</ItemCode><ItemName>מוצר ${code}</ItemName><ManufacturerName></ManufacturerName><UnitQty>יחידות</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

type Promo = {
  id: string;
  /** RewardType: 1 or 10 = N for a total, 2 = percent, 3 = fixed unit price. */
  reward: 1 | 2 | 3 | 10;
  items: string[];
  minQty?: number;
  price?: number;
  rate?: number;
  start?: string;
  end?: string;
  days?: string;
  limit?: number;
  club?: string;
  coupon?: 0 | 1;
};
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>מבצע ${p.id}</PromotionDescription><PromotionStartDateTime>${p.start ?? "2026-11-01T00:00:00.000"}</PromotionStartDateTime><PromotionEndDateTime>${p.end ?? "2026-11-30T23:59:00.000"}</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays>${p.days ?? ""}</PromotionDays><RedemptionLimit>${p.limit ?? 0}</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>${p.club ?? "0 - כלל הלקוחות"}</ClubID><IsGiftItem /><AdditionalIsCoupon>${p.coupon ?? 0}</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems>${p.items
    .map(
      (code) =>
        `<PromotionItem><ItemCode>${code}</ItemCode><ItemType>1</ItemType><RewardType>${p.reward}</RewardType><MinQty>${(p.minQty ?? 1).toFixed(2)}</MinQty><MaxQty></MaxQty><DiscountRate>${p.rate ?? ""}</DiscountRate><DiscountedPrice>${(p.price ?? 0).toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${(p.price ?? 0).toFixed(2)}</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem>`,
    )
    .join("")}</PromotionItems></Group></Groups></Promotion>`;
const promosXml = (chain: string, promos: Promo[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`;
const fullName = (chain: string, ts = "20261104-010000") => `PromoFull${chain}-001-001-${ts}.xml`;
const updateName = (chain: string, ts = "20261104-120000") => `Promo${chain}-001-001-${ts}.xml`;

// --- world ----------------------------------------------------------------------------------------------------------
type ChainSetup = { key: string; id: string; items: [string, number][]; promos: Promo[] };
const osher = (items: [string, number][], promos: Promo[] = []): ChainSetup => ({ key: "osher-ad", id: OSHER, items, promos });

type Store = { storeId: string; total: number; items: Line[] };
type Line = {
  code: string;
  price: number;
  quantity: number;
  lineTotal: number;
  promotion?: { id: string; kind: string; minQty: number; amount: number; audience: string; text: string };
};

async function world(chains: ChainSetup[], now = WEDNESDAY) {
  const clock = fakeClock(now);
  const deps = buildDeps(loadConfig(), { clock });
  const app = createApp(deps);
  const setPos = deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?");
  chains.forEach((c, i) => {
    ingestStores(deps, c.key, storesXml(c.id));
    ingestPrices(deps, c.key, pricesXml(c.id, c.items), `PriceFull${c.id}-001-001-20261104-000000.xml`);
    ingestPromotions(deps, c.key, promosXml(c.id, c.promos), fullName(c.id));
    setPos.run(here.lat + 0.0045 * (i + 1), here.lng, c.id);
  });
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "promo@prices.test", password: "password1234", name: "Promo" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const post = (body: unknown, auth = true) =>
    app.request("/api/compare", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) }, body: JSON.stringify(body) });
  const compare = async (items: [string, number][], sort?: "price") => {
    const res = await post({ ...here, items: items.map(([code, quantity]) => ({ code, quantity })), ...(sort ? { sort } : {}) });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: Store[] }).stores;
  };
  /** The one store's line for `code` at `quantity`. */
  const line = async (code: string, quantity = 1) => (await compare([[code, quantity]]))[0]!.items[0]!;
  return { deps, clock, post, compare, line };
}

describe("Compare with Promotions", () => {
  it("fixed unit price (RewardType 3): the line total uses it, price stays the Shelf price", async () => {
    const w = await world([osher([[A, 6.9]], [{ id: "101", reward: 3, items: [A], price: 4.9 }])]);
    const [s] = await w.compare([[A, 2]]);
    expect(s!.items[0]).toMatchObject({
      code: A,
      price: 6.9,
      quantity: 2,
      lineTotal: 9.8,
      promotion: { id: "101", kind: "price", minQty: 1, amount: 4.9, audience: "all", text: "₪4.90 במקום ₪6.90" },
    });
    expect(s!.total).toBe(9.8);
  });

  it('"3 for ₪10" (RewardType 1): full sets get the bundle, the rest the Shelf price, fewer than 3 none', async () => {
    const w = await world([osher([[A, 4]], [{ id: "102", reward: 1, items: [A], minQty: 3, price: 10 }])]);
    expect(await w.line(A, 3)).toMatchObject({
      price: 4,
      quantity: 3,
      lineTotal: 10,
      promotion: { id: "102", kind: "bundle", minQty: 3, amount: 10, audience: "all", text: "3 ב-₪10" },
    });
    const four = await w.line(A, 4);
    expect(four).toMatchObject({ lineTotal: 14, promotion: { id: "102" } });
    const two = await w.line(A, 2);
    expect(two).toMatchObject({ price: 4, lineTotal: 8 });
    expect(two).not.toHaveProperty("promotion");
    expect((await w.compare([[A, 4]]))[0]!.total).toBe(14);
  });

  it("writes agorot in the bundle text only when there are some", async () => {
    const w = await world([osher([[A, 5]], [{ id: "103", reward: 1, items: [A], minQty: 3, price: 12.9 }])]);
    expect((await w.line(A, 3)).promotion?.text).toBe("3 ב-₪12.90");
  });

  it("a mix-and-match Promotion (RewardType 10) listing two products counts one product line reaching MinQty", async () => {
    const w = await world([osher([[A, 8], [B, 8]], [{ id: "104", reward: 10, items: [A, B], minQty: 2, price: 15 }])]);
    expect(await w.line(A, 2)).toMatchObject({ lineTotal: 15, promotion: { id: "104", kind: "bundle", minQty: 2, amount: 15, text: "2 ב-₪15" } });
    const [s] = await w.compare([[A, 1], [B, 1]]);
    expect(s!.total).toBe(16);
    for (const l of s!.items) expect(l).not.toHaveProperty("promotion");
  });

  it("percent off (RewardType 2) takes that share off the Shelf price of every unit", async () => {
    const w = await world([osher([[A, 6.9]], [{ id: "105", reward: 2, items: [A], rate: 20 }])]);
    expect(await w.line(A, 2)).toMatchObject({
      price: 6.9,
      lineTotal: 11.04,
      promotion: { id: "105", kind: "percent", minQty: 1, amount: 20, audience: "all", text: "20% הנחה" },
    });
  });

  it("a Promotion that would cost more than the Shelf price is not applied", async () => {
    const w = await world([
      osher([[A, 6.9], [B, 7]], [
        { id: "106", reward: 3, items: [A], price: 7.9 },
        { id: "107", reward: 1, items: [B], minQty: 3, price: 25 },
      ]),
    ]);
    const a = await w.line(A, 2);
    expect(a.lineTotal).toBe(13.8);
    expect(a).not.toHaveProperty("promotion");
    const b = await w.line(B, 3);
    expect(b.lineTotal).toBe(21);
    expect(b).not.toHaveProperty("promotion");
  });

  it("the cheapest running Promotion on a line wins, and only one applies", async () => {
    const w = await world([
      osher([[A, 10]], [
        { id: "108", reward: 3, items: [A], price: 8 },
        { id: "109", reward: 2, items: [A], rate: 40 },
      ]),
    ]);
    expect(await w.line(A, 1)).toMatchObject({ lineTotal: 6, promotion: { id: "109" } });
  });

  it("RedemptionLimit caps the units that get the Promotion, the rest pay the Shelf price", async () => {
    const w = await world([osher([[A, 6.9]], [{ id: "110", reward: 3, items: [A], price: 4.9, limit: 2 }])]);
    expect(await w.line(A, 3)).toMatchObject({ lineTotal: 16.7, promotion: { id: "110" } });
  });

  describe("when a Promotion runs (Israel time)", () => {
    const one = (p: Partial<Promo>, now = WEDNESDAY) => world([osher([[A, 6.9]], [{ id: "120", reward: 3, items: [A], price: 4.9, ...p }])], now);
    const applies = async (p: Partial<Promo>, now = WEDNESDAY) => ((await (await one(p, now)).line(A)).promotion ? true : false);

    it("not before its start, from the start on", async () => {
      expect(await applies({ start: "2026-11-05T00:00:00.000" })).toBe(false);
      expect(await applies({ start: "2026-11-04T12:00:00.000" })).toBe(true);
    });

    it("until its end, not at or after it", async () => {
      expect(await applies({ end: "2026-11-04T23:59:00.000" })).toBe(true);
      expect(await applies({ end: "2026-11-04T12:00:00.000" })).toBe(false);
      expect(await applies({ end: "2026-11-03T23:59:00.000" })).toBe(false);
    });

    it("follows the clock: running now, over an hour later", async () => {
      const w = await one({ end: "2026-11-04T13:00:00.000" });
      expect((await w.line(A)).promotion).toBeDefined();
      w.clock.advance(61 * 60 * 1000);
      expect((await w.line(A)).promotion).toBeUndefined();
    });

    it("only on the PromotionDays (1 = Sunday ... 7 = Saturday); empty means every day", async () => {
      expect(await applies({ days: "6" })).toBe(false); // Wednesday
      expect(await applies({ days: "6" }, FRIDAY)).toBe(true);
      expect(await applies({ days: "4" })).toBe(true);
      expect(await applies({ days: "1,2,3,4,5" })).toBe(true);
      expect(await applies({ days: "1,2,3,4,5" }, FRIDAY)).toBe(false);
      expect(await applies({ days: "" }, FRIDAY)).toBe(true);
    });
  });

  it("the cheaper store after its Promotion sorts first by price", async () => {
    const w = await world([
      osher([[A, 10]]), // total 10, nearer
      { key: "yohananof", id: YOHANANOF, items: [[A, 12]], promos: [{ id: "130", reward: 3, items: [A], price: 7 }] },
    ]);
    const stores = await w.compare([[A, 1]], "price");
    expect(stores.map((s) => s.storeId.split("-")[0])).toEqual([YOHANANOF, OSHER]);
    expect(stores.map((s) => s.total)).toEqual([7, 10]);
  });

  it("a new PromoFull replaces the store's Promotions: one it no longer lists has ended", async () => {
    const w = await world([osher([[A, 6.9], [B, 6.9]], [{ id: "140", reward: 3, items: [A], price: 4.9 }, { id: "141", reward: 3, items: [B], price: 5.9 }])]);
    expect((await w.line(A)).promotion?.id).toBe("140");
    ingestPromotions(w.deps, "osher-ad", promosXml(OSHER, [{ id: "141", reward: 3, items: [B], price: 5.9 }]), fullName(OSHER, "20261104-110000"));
    const [s] = await w.compare([[A, 1], [B, 1]]);
    expect(s!.items.find((l) => l.code === A)).toMatchObject({ lineTotal: 6.9 });
    expect(s!.items.find((l) => l.code === A)).not.toHaveProperty("promotion");
    expect(s!.items.find((l) => l.code === B)?.promotion?.id).toBe("141");
  });

  it("a Promo update file replaces the Promotions it lists and leaves the others in place", async () => {
    const w = await world([osher([[A, 6.9], [B, 6.9]], [{ id: "150", reward: 3, items: [A], price: 4.9 }, { id: "151", reward: 3, items: [B], price: 5.9 }])]);
    ingestPromotions(w.deps, "osher-ad", promosXml(OSHER, [{ id: "150", reward: 3, items: [A], price: 3.5 }]), updateName(OSHER));
    const [s] = await w.compare([[A, 1], [B, 1]]);
    expect(s!.items.find((l) => l.code === A)).toMatchObject({ lineTotal: 3.5, promotion: { id: "150", amount: 3.5, text: "₪3.50 במקום ₪6.90" } });
    expect(s!.items.find((l) => l.code === B)).toMatchObject({ lineTotal: 5.9, promotion: { id: "151" } });
  });

  it("a Promo update file can add a Promotion the PromoFull did not have", async () => {
    const w = await world([osher([[A, 6.9], [C, 6.9]], [{ id: "160", reward: 3, items: [A], price: 4.9 }])]);
    ingestPromotions(w.deps, "osher-ad", promosXml(OSHER, [{ id: "161", reward: 3, items: [C], price: 5.5 }]), updateName(OSHER));
    expect((await w.line(A)).promotion?.id).toBe("160");
    expect((await w.line(C)).promotion?.id).toBe("161");
  });

  it("ingestPromotions reports the grouped layout and how many Promotions it loaded", () => {
    const deps = buildDeps(loadConfig(), { clock: fakeClock(WEDNESDAY) });
    ingestStores(deps, "osher-ad", storesXml(OSHER));
    const r = ingestPromotions(deps, "osher-ad", promosXml(OSHER, [{ id: "170", reward: 3, items: [A], price: 4.9 }, { id: "171", reward: 2, items: [B], rate: 10 }]), fullName(OSHER));
    expect(r).toMatchObject({ layout: "grouped", loaded: 2 });
  });

  it("rows repeating one PromotionID are one Promotion covering the union of their products", async () => {
    const w = await world([osher([[A, 6.9], [B, 6.9]], [
      { id: "180", reward: 3, items: [A], price: 4.9 },
      { id: "180", reward: 3, items: [B], price: 4.9 },
    ])]);
    expect((await w.line(A)).promotion?.id).toBe("180");
    expect((await w.line(B)).promotion?.id).toBe("180");
  });

  it("requires a signed-in User", async () => {
    const w = await world([osher([[A, 6.9]])]);
    const res = await w.post({ ...here, items: [{ code: A, quantity: 1 }] }, false);
    expect(res.status).toBe(401);
  });
});

describe("Compare with Promotions from real Yohananof files (downloaded 2026-11-04)", () => {
  const fx = (f: string) => readXml(fileURLToPath(new URL(`../__fixtures__/real/${f}`, import.meta.url)));
  const code = { cookies: "7622201401900", biscuits: "7290020790002", game: "65541083271", game2: "6970989028019", chocolate: "7622201050757", salad: "7290002825722" };

  async function yohananof() {
    const w = await world([], new Date("2026-11-04T15:00:00+02:00"));
    ingestStores(w.deps, "yohananof", fx("yohananof-stores.xml"));
    ingestPrices(w.deps, "yohananof", fx("promos/yohananof/PriceFull7290803800003-000-001-20261104-004032.gz"), "PriceFull7290803800003-000-001-20261104-004032.gz");
    ingestPromotions(w.deps, "yohananof", fx("promos/yohananof/PromoFull7290803800003-000-001-20261104-004032.gz"), "PromoFull7290803800003-000-001-20261104-004032.gz");
    ingestPromotions(w.deps, "yohananof", fx("promos/yohananof/Promo7290803800003-000-001-20261104-134000.gz"), "Promo7290803800003-000-001-20261104-134000.gz");
    w.deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, YOHANANOF);
    return w;
  }

  it("a fixed unit price", async () => {
    const w = await yohananof();
    expect(await w.line(code.cookies)).toMatchObject({
      price: 16.9,
      lineTotal: 13.9,
      promotion: { id: "372709", kind: "price", amount: 13.9, text: "₪13.90 במקום ₪16.90" },
    });
  });

  it("3 for ₪50 (mix-and-match)", async () => {
    const w = await yohananof();
    expect(await w.line(code.biscuits, 3)).toMatchObject({ price: 19.9, lineTotal: 50, promotion: { id: "373824", kind: "bundle", minQty: 3, amount: 50, text: "3 ב-₪50" } });
    expect((await w.line(code.biscuits, 2)).lineTotal).toBe(39.8);
  });

  it("50% off", async () => {
    const w = await yohananof();
    expect(await w.line(code.game)).toMatchObject({ price: 79.9, lineTotal: 39.95, promotion: { id: "369605", kind: "percent", amount: 50, text: "50% הנחה" } });
    expect((await w.line(code.game2)).lineTotal).toBe(19.95);
  });

  it("a Promotion that is only in the update file", async () => {
    const w = await yohananof();
    expect(await w.line(code.chocolate, 2)).toMatchObject({ price: 8.9, lineTotal: 15, promotion: { id: "372706", kind: "bundle", minQty: 2, text: "2 ב-₪15" } });
  });

  it("an employees' club Promotion (1 - מועדון עובדים) leaves the line at the Shelf price", async () => {
    const w = await yohananof();
    const l = await w.line(code.salad, 2);
    expect(l).toMatchObject({ price: 14.9, lineTotal: 29.8 });
    expect(l).not.toHaveProperty("promotion");
  });
});
