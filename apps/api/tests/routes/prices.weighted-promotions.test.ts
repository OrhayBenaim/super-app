import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestPromotions, ingestStores, readXml } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const OSHER = "7290103152017";
const YOHANANOF = "7290803800003";
const POLITZER = "7291059100008";
const here = { lat: 32.0853, lng: 34.7818 };
const WEDNESDAY = new Date("2026-11-04T12:00:00+02:00");
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const A = gtin("7290001000001");

// --- builders (as in prices.promotions.test.ts, with weighted products and a raw MinQty) ------------------------------
const storesXml = (chain: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
/** Weighted products are priced per kilo. */
const pricesXml = (chain: string, items: [code: string, price: number][]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, price]) => `<Item><ItemCode>${code}</ItemCode><ItemName>מוצר ${code}</ItemName><ManufacturerName></ManufacturerName><UnitQty>ק"ג</UnitQty><Quantity>1</Quantity><bIsWeighted>1</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

type Promo = {
  id: string;
  /** RewardType: 1 or 10 = N for a total, 2 = percent, 3 = fixed price. */
  reward: 1 | 2 | 3 | 10;
  items: string[];
  /** MinQty exactly as the file writes it. */
  minQty: string;
  price?: number;
  rate?: number;
  limit?: number;
};
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>מבצע ${p.id}</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-11-30T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays></PromotionDays><RedemptionLimit>${p.limit ?? 0}</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems>${p.items
    .map(
      (code) =>
        `<PromotionItem><ItemCode>${code}</ItemCode><ItemType>1</ItemType><RewardType>${p.reward}</RewardType><MinQty>${p.minQty}</MinQty><MaxQty></MaxQty><DiscountRate>${p.rate ?? ""}</DiscountRate><DiscountedPrice>${(p.price ?? 0).toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${(p.price ?? 0).toFixed(2)}</DiscountedPricePerMida><bIsWeighted>1</bIsWeighted></PromotionItem>`,
    )
    .join("")}</PromotionItems></Group></Groups></Promotion>`;
const promosXml = (chain: string, promos: Promo[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`;

type Store = { storeId: string; total: number; items: Line[] };
type Line = {
  code: string;
  price: number;
  quantity: number;
  lineTotal: number;
  promotion?: { id: string; kind: string; minQty: number; amount: number; audience: string; text: string };
};

async function world(setup: (deps: ReturnType<typeof buildDeps>) => void, now = WEDNESDAY) {
  const deps = buildDeps(loadConfig(), { clock: fakeClock(now) });
  const app = createApp(deps);
  setup(deps);
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "weighted@prices.test", password: "password1234", name: "Weighted" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  /** The one store's line for `code` at `quantity` (kilos for a weighted product). */
  const line = async (code: string, quantity: number) => {
    const res = await app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ...here, items: [{ code, quantity }] }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: Store[] }).stores[0]!.items[0]!;
  };
  return { deps, line };
}

/** One Osher store selling A at `price` per kilo with one Promotion on it. */
const osherWith = (price: number, p: Omit<Promo, "id" | "items">) =>
  world((deps) => {
    ingestStores(deps, "osher-ad", storesXml(OSHER));
    ingestPrices(deps, "osher-ad", pricesXml(OSHER, [[A, price]]), `PriceFull${OSHER}-001-001-20261104-000000.xml`);
    ingestPromotions(deps, "osher-ad", promosXml(OSHER, [{ id: "301", items: [A], ...p }]), `PromoFull${OSHER}-001-001-20261104-010000.xml`);
    deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, OSHER);
  });

describe("Compare with Promotions on products Sold by weight", () => {
  it('"0.01" is a per-kilo price: every kilo, fractional too, costs it', async () => {
    const w = await osherWith(40, { reward: 3, minQty: "0.01", price: 29.9 });
    expect(await w.line(A, 1.5)).toMatchObject({
      price: 40,
      quantity: 1.5,
      lineTotal: 44.85,
      promotion: { id: "301", kind: "price", minQty: 1, amount: 29.9, audience: "all", text: "₪29.90 לק״ג" },
    });
  });

  it('"0.010" is the same per-kilo price, written without agorot when whole', async () => {
    const w = await osherWith(40, { reward: 1, minQty: "0.010", price: 30 });
    expect(await w.line(A, 2)).toMatchObject({ lineTotal: 60, promotion: { kind: "price", minQty: 1, amount: 30, text: "₪30 לק״ג" } });
  });

  it("RewardType 10 with MinQty 1 is a per-kilo price too (Victory)", async () => {
    const w = await osherWith(40, { reward: 10, minQty: "1", price: 25 });
    expect(await w.line(A, 2.5)).toMatchObject({ lineTotal: 62.5, promotion: { kind: "price", minQty: 1, amount: 25, text: "₪25 לק״ג" } });
  });

  it("RedemptionLimit caps the kilos that get the per-kilo price, the rest pay the Shelf price", async () => {
    const w = await osherWith(40, { reward: 3, minQty: "0.01", price: 30, limit: 2 });
    expect((await w.line(A, 3)).lineTotal).toBe(100);
  });

  describe('a price for a weight ("2 kg for 80", Shelf 50 per kilo)', () => {
    it("full sets of that weight get the price, the rest the Shelf price", async () => {
      const w = await osherWith(50, { reward: 3, minQty: "2", price: 80 });
      expect(await w.line(A, 2)).toMatchObject({
        lineTotal: 80,
        promotion: { id: "301", kind: "bundle", minQty: 2, amount: 80, audience: "all", text: "2 ק״ג ב-₪80" },
      });
      expect((await w.line(A, 3)).lineTotal).toBe(130);
      expect((await w.line(A, 4.5)).lineTotal).toBe(185);
    });

    it("less than one set gets no promotion", async () => {
      const w = await osherWith(50, { reward: 3, minQty: "2", price: 80 });
      const l = await w.line(A, 1.5);
      expect(l.lineTotal).toBe(75);
      expect(l).not.toHaveProperty("promotion");
    });

    it("writes the weight as the file gives it", async () => {
      const w = await osherWith(50, { reward: 1, minQty: "1.9", price: 76 });
      expect(await w.line(A, 1.9)).toMatchObject({ lineTotal: 76, promotion: { kind: "bundle", minQty: 1.9, text: "1.9 ק״ג ב-₪76" } });
    });

    it("under a kilo the text is in grams", async () => {
      const w = await osherWith(100, { reward: 3, minQty: "0.25", price: 22 });
      expect(await w.line(A, 0.5)).toMatchObject({ lineTotal: 44, promotion: { kind: "bundle", minQty: 0.25, amount: 22, text: "250 גרם ב-₪22" } });
    });

    it("counts fractional sets despite float error: 0.6 kg is three sets of 0.2 kg", async () => {
      const w = await osherWith(50, { reward: 3, minQty: "0.2", price: 8 });
      expect(await w.line(A, 0.6)).toMatchObject({ lineTotal: 24, promotion: { kind: "bundle", minQty: 0.2, text: "200 גרם ב-₪8" } });
    });
  });

  describe("when it is unclear whether the price is per kilo or per pack, the Promotion is not applied", () => {
    it.each([
      ["MinQty empty", { reward: 3, minQty: "", price: 20 }],
      ["MinQty 0", { reward: 3, minQty: "0", price: 20 }],
      ["MinQty 200", { reward: 3, minQty: "200", price: 20 }],
      ["MinQty 70", { reward: 1, minQty: "70", price: 20 }],
      ["price 0", { reward: 3, minQty: "2", price: 0 }],
      ["MinQty 0.01 with a price under 1 (the price of 10 g)", { reward: 3, minQty: "0.01", price: 0.8 }],
    ] as [string, Omit<Promo, "id" | "items">][])("%s", async (_name, p) => {
      const w = await osherWith(50, p);
      const l = await w.line(A, 2);
      expect(l.lineTotal).toBe(100);
      expect(l).not.toHaveProperty("promotion");
    });
  });

  it("percent off (RewardType 2) with MinQty 0.01 takes that share off every kilo", async () => {
    const w = await osherWith(40, { reward: 2, minQty: "0.01", rate: 10 });
    expect(await w.line(A, 2)).toMatchObject({ lineTotal: 72, promotion: { kind: "percent", amount: 10, text: "10% הנחה" } });
  });
});

describe("Compare with weighted Promotions from real files (downloaded 2026-11-04)", () => {
  const fx = (f: string) => readXml(fileURLToPath(new URL(`../__fixtures__/real/${f}`, import.meta.url)));
  const now = new Date("2026-11-04T15:00:00+02:00");
  const place = (deps: ReturnType<typeof buildDeps>, chain: string) =>
    deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, chain);

  const yohananof = () =>
    world((deps) => {
      ingestStores(deps, "yohananof", fx("yohananof-stores.xml"));
      ingestPrices(deps, "yohananof", fx("promos/yohananof/PriceFull7290803800003-000-001-20261104-004032.gz"), "PriceFull7290803800003-000-001-20261104-004032.gz");
      ingestPromotions(deps, "yohananof", fx("promos/yohananof/PromoFull7290803800003-000-001-20261104-004032.gz"), "PromoFull7290803800003-000-001-20261104-004032.gz");
      ingestPromotions(deps, "yohananof", fx("promos/yohananof/Promo7290803800003-000-001-20261104-134000.gz"), "Promo7290803800003-000-001-20261104-134000.gz");
      place(deps, YOHANANOF);
    }, now);

  const politzer = () =>
    world((deps) => {
      ingestStores(deps, "politzer", storesXml(POLITZER));
      ingestPrices(deps, "politzer", fx("promos/politzer/PriceFull7291059100008-001-001-20261104-001019.gz"), "PriceFull7291059100008-001-001-20261104-001019.gz");
      ingestPromotions(deps, "politzer", fx("promos/politzer/PromoFull7291059100008-001-001-20261104-001111.gz"), "PromoFull7291059100008-001-001-20261104-001111.gz");
      place(deps, POLITZER);
    }, now);

  it("Yohananof: a per-kilo price (schnitzel 34.90 instead of 39.90)", async () => {
    const w = await yohananof();
    expect(await w.line(`${YOHANANOF}:400303`, 1.5)).toMatchObject({
      price: 39.9,
      lineTotal: 52.35,
      promotion: { id: "354475", kind: "price", minQty: 1, amount: 34.9, text: "₪34.90 לק״ג" },
    });
  });

  it("Yohananof: 250 g for 20 (pastrami, Shelf 94 per kilo)", async () => {
    const w = await yohananof();
    expect(await w.line(`${YOHANANOF}:318103`, 0.5)).toMatchObject({
      price: 94,
      lineTotal: 40,
      promotion: { id: "355402", kind: "bundle", minQty: 0.25, amount: 20, text: "250 גרם ב-₪20" },
    });
    expect((await w.line(`${YOHANANOF}:318103`, 0.3)).lineTotal).toBe(24.7);
  });

  it("Politzer: 300 g for 15 (turkey sausage, Shelf 60 per kilo)", async () => {
    const w = await politzer();
    expect(await w.line("7290000530024", 0.6)).toMatchObject({
      price: 60,
      lineTotal: 30,
      promotion: { id: "133091", kind: "bundle", minQty: 0.3, amount: 15, text: "300 גרם ב-₪15" },
    });
    expect((await w.line("7290000530024", 0.4)).lineTotal).toBe(21);
  });

  it("Politzer: a cheese Promotion priced at 0.80 for MinQty 0.010 is not applied", async () => {
    const w = await politzer();
    const l = await w.line("7290005079290", 0.5);
    expect(l).toMatchObject({ price: 87.9, lineTotal: 43.95 });
    expect(l).not.toHaveProperty("promotion");
  });
});
