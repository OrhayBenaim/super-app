import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestPromotions, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const OSHER = "7290103152017";
const YOHANANOF = "7290803800003";
const here = { lat: 32.0853, lng: 34.7818 };
const WEDNESDAY = new Date("2026-11-04T12:00:00+02:00");
const FRIDAY = new Date("2026-11-06T12:00:00+02:00");
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const [A, B] = ["7290001000001", "7290001000002"].map(gtin);

// --- builders -------------------------------------------------------------------------------------------------------
const storesXml = (chain: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: [code: string, price: number][]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, price]) => `<Item><ItemCode>${code}</ItemCode><ItemName>מוצר ${code}</ItemName><ManufacturerName></ManufacturerName><UnitQty>יחידות</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

type Promo = {
  id: string;
  /** RewardType: 3 = fixed unit price, 2 = percent (rate 100 is a gift), 11 = a kind Grocer cannot price. */
  reward: 2 | 3 | 11;
  items: string[];
  price?: number;
  rate?: number;
  desc?: string;
  start?: string;
  end?: string;
  days?: string;
};
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>${p.desc ?? `מבצע ${p.id}`}</PromotionDescription><PromotionStartDateTime>${p.start ?? "2026-11-01T00:00:00.000"}</PromotionStartDateTime><PromotionEndDateTime>${p.end ?? "2026-11-30T23:59:00.000"}</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays>${p.days ?? ""}</PromotionDays><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems>${p.items
    .map(
      (code) =>
        `<PromotionItem><ItemCode>${code}</ItemCode><ItemType>1</ItemType><RewardType>${p.reward}</RewardType><MinQty>1.00</MinQty><MaxQty></MaxQty><DiscountRate>${p.rate ?? ""}</DiscountRate><DiscountedPrice>${(p.price ?? 0).toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${(p.price ?? 0).toFixed(2)}</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem>`,
    )
    .join("")}</PromotionItems></Group></Groups></Promotion>`;
const promosXml = (chain: string, promos: Promo[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`;

// --- world ----------------------------------------------------------------------------------------------------------
type ChainSetup = { key: string; id: string; items: [string, number][]; promos: Promo[] };
const osher = (items: [string, number][], promos: Promo[] = []): ChainSetup => ({ key: "osher-ad", id: OSHER, items, promos });

type Line = {
  code: string;
  price: number;
  quantity: number;
  lineTotal: number;
  promotion?: { id: string };
  info?: { id: string; description: string }[];
};
type Store = { storeId: string; total: number; items: Line[] };

async function world(chains: ChainSetup[], now = WEDNESDAY) {
  const deps = buildDeps(loadConfig(), { clock: fakeClock(now) });
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
    headers: { "content-type": "application/json", },
    body: JSON.stringify({ email: "info@prices.test", password: "password1234", name: "Info" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const post = (body: unknown, auth = true) =>
    app.request("/api/compare", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) }, body: JSON.stringify(body) });
  const compare = async (items: [string, number][], sort?: "price") => {
    const res = await post({ ...here, items: items.map(([code, quantity]) => ({ code, quantity })), ...(sort ? { sort } : {}) });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: Store[] }).stores;
  };
  const line = async (code: string, quantity = 1) => (await compare([[code, quantity]]))[0]!.items[0]!;
  return { post, compare, line };
}

describe("Compare with information-only Promotions", () => {
  it("a gift Promotion is shown with its description, id without leading zeros, and left out of the totals", async () => {
    const w = await world([osher([[A, 6.9], [B, 5]], [{ id: "0201", reward: 2, items: [A], rate: 100, desc: "קנה חלב וקבל לחם מתנה" }])]);
    const [s] = await w.compare([[A, 2], [B, 1]]);
    const a = s!.items.find((l) => l.code === A)!;
    expect(a).toMatchObject({ price: 6.9, quantity: 2, lineTotal: 13.8, info: [{ id: "201", description: "קנה חלב וקבל לחם מתנה" }] });
    expect(a).not.toHaveProperty("promotion");
    const b = s!.items.find((l) => l.code === B)!;
    expect(b.lineTotal).toBe(5);
    expect(b).not.toHaveProperty("info");
    expect(s!.total).toBe(18.8);
  });

  it("a reward priced only in its description (RewardType 3 at ₪0) and an unknown reward kind (11) are shown the same way", async () => {
    const w = await world([
      osher([[A, 4], [B, 6]], [
        { id: "202", reward: 3, items: [A], price: 0, desc: "מחיר מיוחד בקופה" },
        { id: "203", reward: 11, items: [B], desc: "הטבה מיוחדת" },
      ]),
    ]);
    const [s] = await w.compare([[A, 3], [B, 1]]);
    const a = s!.items.find((l) => l.code === A)!;
    const b = s!.items.find((l) => l.code === B)!;
    expect(a).toMatchObject({ lineTotal: 12, info: [{ id: "202", description: "מחיר מיוחד בקופה" }] });
    expect(b).toMatchObject({ lineTotal: 6, info: [{ id: "203", description: "הטבה מיוחדת" }] });
    expect(a).not.toHaveProperty("promotion");
    expect(b).not.toHaveProperty("promotion");
    expect(s!.total).toBe(18);
  });

  it("a line can have a priced Promotion applied and an information-only one", async () => {
    const w = await world([
      osher([[A, 6.9]], [
        { id: "301", reward: 3, items: [A], price: 4.9 },
        { id: "302", reward: 2, items: [A], rate: 100, desc: "מתנה לקונים" },
      ]),
    ]);
    const l = await w.line(A, 2);
    expect(l).toMatchObject({ lineTotal: 9.8, promotion: { id: "301" }, info: [{ id: "302", description: "מתנה לקונים" }] });
  });

  describe("only while it runs (Israel time)", () => {
    const hasInfo = async (p: Partial<Promo>, now = WEDNESDAY) => {
      const w = await world([osher([[A, 6.9]], [{ id: "310", reward: 2, items: [A], rate: 100, ...p }])], now);
      const l = await w.line(A);
      expect(l.lineTotal).toBe(6.9);
      return "info" in l;
    };

    it("not before its start, from the start on", async () => {
      expect(await hasInfo({ start: "2026-11-05T00:00:00.000" })).toBe(false);
      expect(await hasInfo({ start: "2026-11-04T12:00:00.000" })).toBe(true);
    });

    it("not at or after its end", async () => {
      expect(await hasInfo({ end: "2026-11-04T23:59:00.000" })).toBe(true);
      expect(await hasInfo({ end: "2026-11-04T12:00:00.000" })).toBe(false);
      expect(await hasInfo({ end: "2026-11-03T23:59:00.000" })).toBe(false);
    });

    it("only on its PromotionDays (6 = Friday)", async () => {
      expect(await hasInfo({ days: "6" })).toBe(false); // Wednesday
      expect(await hasInfo({ days: "6" }, FRIDAY)).toBe(true);
      expect(await hasInfo({ days: "" })).toBe(true);
    });
  });

  it("sorting by price ignores information-only Promotions", async () => {
    const w = await world([
      osher([[A, 10]]), // total 10, nearer
      { key: "yohananof", id: YOHANANOF, items: [[A, 12]], promos: [{ id: "320", reward: 2, items: [A], rate: 100, desc: "מתנה" }] },
    ]);
    const stores = await w.compare([[A, 1]], "price");
    expect(stores.map((s) => s.storeId.split("-")[0])).toEqual([OSHER, YOHANANOF]);
    expect(stores.map((s) => s.total)).toEqual([10, 12]);
    expect(stores[1]!.items[0]).toMatchObject({ info: [{ id: "320", description: "מתנה" }] });
    expect(stores[0]!.items[0]).not.toHaveProperty("info");
  });

  it("requires a signed-in User", async () => {
    const w = await world([osher([[A, 6.9]])]);
    const res = await w.post({ ...here, items: [{ code: A, quantity: 1 }] }, false);
    expect(res.status).toBe(401);
  });
});
