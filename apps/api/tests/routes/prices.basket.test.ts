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
const [A, B, C, D] = ["7290001000001", "7290001000002", "7290001000003", "7290001000004"].map(gtin);
const ZEROS = "0000000000000";

// --- builders -------------------------------------------------------------------------------------------------------
const storesXml = (chain: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: [code: string, price: number][]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, price]) => `<Item><ItemCode>${code}</ItemCode><ItemName>מוצר ${code}</ItemName><ManufacturerName></ManufacturerName><UnitQty>יחידות</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

/**
 * A price-to-pay Promotion (RewardType 3) on `items`. With `min` it is a spend deal ("X at ₪price above ₪min"):
 * shape "one" puts the minimum on the reward group itself; "cond-first" / "cond-last" put it on a second group that holds
 * the 0000000000000 condition item (cond-first also lists the products as RewardType 12 rows).
 */
type Deal = { id: string; items: string[]; price: number; min?: number; limit?: number; amd?: 0 | 1; shape?: "one" | "cond-first" | "cond-last" };

const item = (code: string, reward: number, price: number) =>
  `<PromotionItem><ItemCode>${code}</ItemCode><ItemType>1</ItemType><RewardType>${reward}</RewardType><MinQty>1.00</MinQty><MaxQty></MaxQty><DiscountRate></DiscountRate><DiscountedPrice>${price.toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${price.toFixed(2)}</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem>`;
const group = (gid: number, items: string[], minPurchase: number | "" = "") =>
  `<Group><GroupID>${gid}</GroupID><MinPurchaseAmount>${minPurchase}</MinPurchaseAmount><DiscountType></DiscountType><PromotionItems>${items.join("")}</PromotionItems></Group>`;
const promo = (d: Deal) => {
  const reward = d.items.map((c) => item(c, 3, d.price));
  const cond = [item(ZEROS, 0, 0)];
  const groups =
    d.min === undefined
      ? group(1, reward)
      : d.shape === "cond-first"
        ? group(1, [...cond, ...d.items.map((c) => item(c, 12, 0))], d.min) + group(2, reward)
        : d.shape === "cond-last"
          ? group(1, reward) + group(2, cond, d.min)
          : group(1, reward, d.min);
  return `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime>${d.amd === undefined ? "" : `<AllowMultipleDiscounts>${d.amd}</AllowMultipleDiscounts>`}<PromotionID>${d.id}</PromotionID><PromotionDescription>מבצע ${d.id}</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-11-30T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays></PromotionDays><RedemptionLimit>${d.limit ?? 0}</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups>${groups}</Groups></Promotion>`;
};
const promosXml = (chain: string, deals: Deal[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${deals.map(promo).join("")}</Promotions></Root>`;

// --- world ----------------------------------------------------------------------------------------------------------
type ChainSetup = { key: string; id: string; items: [string, number][]; promos: Deal[] };
const osher = (items: [string, number][], promos: Deal[] = []): ChainSetup => ({ key: "osher-ad", id: OSHER, items, promos });

type P = { id: string; kind: string; minQty: number; amount: number; audience: string; text: string };
type Line = { code: string; price: number; quantity: number; lineTotal: number; promotion?: P; hints?: P[] };
type Basket = P & { minPurchase: number; saving: number; codes: string[] };
type Store = { storeId: string; total: number; items: Line[]; basket?: Basket[] };

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
    body: JSON.stringify({ email: "basket@prices.test", password: "password1234", name: "Basket" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const post = (body: unknown, auth = true) =>
    app.request("/api/compare", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) }, body: JSON.stringify(body) });
  const compare = async (items: [string, number][], sort?: "price") => {
    const res = await post({ ...here, items: items.map(([code, quantity]) => ({ code, quantity })), ...(sort ? { sort } : {}) });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: Store[] }).stores;
  };
  /** The first store with a lookup of its lines by code. */
  const first = async (items: [string, number][]) => {
    const [store] = await compare(items);
    return { store: store!, by: (code: string) => store!.items.find((l) => l.code === code)! };
  };
  return { deps, post, compare, first };
}

const DEAL_TEXT = "₪8.90 במקום ₪16.90 מעל ₪75";
const deal900 = (extra: Partial<Deal> = {}): Deal => ({ id: "900", items: [A], price: 8.9, min: 75, limit: 2, amd: 1, ...extra });
const basket900 = (saving: number, extra: Partial<Basket> = {}): Basket => ({
  id: "900", kind: "price", minQty: 1, amount: 8.9, audience: "all", text: DEAL_TEXT, minPurchase: 75, saving, codes: [A], ...extra,
});
const shelf: [string, number][] = [[A, 16.9], [B, 40], [C, 50]];

describe("Compare with basket deals (spend a minimum)", () => {
  it("a deal on one group with a minimum applies when the rest of the List reaches it: the saving is a store-level basket entry", async () => {
    const w = await world([osher(shelf, [deal900()])]);
    const { store, by } = await w.first([[A, 1], [B, 1], [C, 1]]);
    expect(store.basket).toEqual([basket900(8)]);
    expect(by(A)).toMatchObject({ price: 16.9, quantity: 1, lineTotal: 16.9 });
    expect(by(A)).not.toHaveProperty("promotion");
    expect(store.total).toBe(98.9);
  });

  it("below the minimum there is no saving, no basket, no promotion and no hint", async () => {
    const w = await world([osher(shelf, [deal900()])]);
    const { store, by } = await w.first([[A, 1], [B, 1]]);
    expect(store).not.toHaveProperty("basket");
    expect(by(A).lineTotal).toBe(16.9);
    expect(by(A)).not.toHaveProperty("promotion");
    expect(by(A)).not.toHaveProperty("hints");
    expect(store.total).toBe(56.9);
  });

  it("the deal's own products never count toward its minimum", async () => {
    const w = await world([osher(shelf, [deal900({ limit: 0 })])]);
    const { store } = await w.first([[A, 5], [B, 1]]); // List Shelf 124.50, but the rest is only 40
    expect(store).not.toHaveProperty("basket");
    expect(store.total).toBe(124.5);
  });

  it("a RedemptionLimit caps the covered units; the others stay at Shelf", async () => {
    const w = await world([osher(shelf, [deal900()])]);
    const { store, by } = await w.first([[A, 3], [B, 1], [C, 1]]);
    expect(store.basket).toEqual([basket900(16)]);
    expect(by(A)).toMatchObject({ quantity: 3, lineTotal: 50.7 });
    expect(by(A)).not.toHaveProperty("promotion");
    expect(store.total).toBe(124.7);
  });

  it("the rest is measured after its own Promotions", async () => {
    const plain: Deal = { id: "901", items: [B], price: 30, amd: 1 };
    const short = await world([osher([[A, 16.9], [B, 40], [C, 40]], [deal900(), plain])]);
    const s = await short.first([[A, 1], [B, 1], [C, 1]]); // rest after: 30 + 40 = 70 < 75
    expect(s.store).not.toHaveProperty("basket");
    expect(s.by(B)).toMatchObject({ lineTotal: 30, promotion: { id: "901" } });
    expect(s.store.total).toBe(86.9);

    const enough = await world([osher([[A, 16.9], [B, 40], [C, 50]], [deal900(), plain])]);
    const e = await enough.first([[A, 1], [B, 1], [C, 1]]); // rest after: 30 + 50 = 80
    expect(e.store.basket).toEqual([basket900(8)]);
    expect(e.by(B)).toMatchObject({ lineTotal: 30, promotion: { id: "901" } });
    expect(e.store.total).toBe(88.9);
  });

  it("an absent AllowMultipleDiscounts stacks like 1", async () => {
    const w = await world([osher(shelf, [deal900({ amd: undefined }), { id: "901", items: [B], price: 30 }])]);
    const { store, by } = await w.first([[A, 1], [B, 1], [C, 1]]);
    expect(store.basket).toEqual([basket900(8)]);
    expect(by(B).promotion?.id).toBe("901");
    expect(store.total).toBe(88.9);
  });
});

// AllowMultipleDiscounts is ignored for now: a spend deal stacks on the other lines' Promotions whatever it says.
describe("Compare: AllowMultipleDiscounts 0 on a basket deal is read like 1", () => {
  const plainB: Deal = { id: "901", items: [B], price: 30, amd: 1 };

  it("stacks the deal on the other Promotions instead of taking it alone", async () => {
    const w = await world([osher([[A, 30], [B, 40], [C, 50]], [deal900({ price: 10, amd: 0 }), plainB])]);
    const { store, by } = await w.first([[A, 1], [B, 1], [C, 1]]);
    // both: A 10 (saves 20) + B 30 + C 50 = 90; the rest for 900 is 30 + 50 = 80 >= 75
    expect(store.basket).toEqual([basket900(20, { amount: 10, text: "₪10 במקום ₪30 מעל ₪75" })]);
    expect(by(B)).toMatchObject({ lineTotal: 30, promotion: { id: "901" } });
    expect(store.total).toBe(90);
  });

  it("keeps the deal when the other Promotions alone would be cheaper than the deal alone", async () => {
    const w = await world([osher(shelf, [deal900({ amd: 0 }), plainB])]);
    const { store, by } = await w.first([[A, 1], [B, 1], [C, 1]]);
    // both: A 8.90 + B 30 + C 50 = 88.90; the rest for 900 is 30 + 50 = 80 >= 75
    expect(store.basket).toEqual([basket900(8)]);
    expect(by(B)).toMatchObject({ lineTotal: 30, promotion: { id: "901" } });
    expect(store.total).toBe(88.9);
  });

  it("with AllowMultipleDiscounts 1 the same numbers take both", async () => {
    const w = await world([osher([[A, 30], [B, 40], [C, 50]], [deal900({ price: 10, amd: 1 }), plainB])]);
    const { store, by } = await w.first([[A, 1], [B, 1], [C, 1]]);
    expect(store.basket).toHaveLength(1);
    expect(store.basket![0]).toMatchObject({ id: "900", saving: 20 });
    expect(by(B)).toMatchObject({ lineTotal: 30, promotion: { id: "901" } });
    expect(store.total).toBe(90);
  });
});

describe("Compare: a spend deal split over a condition group and a reward group", () => {
  for (const shape of ["cond-first", "cond-last"] as const) {
    it(`${shape}: the 0000000000000 group carries the minimum, same result as one group`, async () => {
      const w = await world([osher(shelf, [deal900({ shape })])]);
      const { store, by } = await w.first([[A, 1], [B, 1], [C, 1]]);
      expect(store.basket).toEqual([basket900(8)]);
      expect(by(A).lineTotal).toBe(16.9);
      expect(by(A)).not.toHaveProperty("promotion");
      expect(store.total).toBe(98.9);
    });
  }
});

describe("Compare: several spend deals together", () => {
  const deal902: Deal = { id: "902", items: [D], price: 10, min: 75, limit: 2, amd: 1 };
  const basket902: Basket = { id: "902", kind: "price", minQty: 1, amount: 10, audience: "all", text: "₪10 במקום ₪20 מעל ₪75", minPurchase: 75, saving: 10, codes: [D] };
  const byId = (b: Basket[] | undefined) => [...(b ?? [])].sort((x, y) => x.id.localeCompare(y.id));

  it("both apply when each minimum is still met with the other applied", async () => {
    const w = await world([osher([[A, 16.9], [D, 20], [B, 80]], [deal900(), deal902])]);
    const { store } = await w.first([[A, 1], [D, 1], [B, 1]]);
    // 900: rest = D at 10 + 80 = 90; 902: rest = A at 8.90 + 80
    expect(byId(store.basket)).toEqual([basket900(8), basket902]);
    expect(store.total).toBe(98.9);
  });

  it("only one applies when together they would break each other's minimum: the one that saves more", async () => {
    const w = await world([osher([[A, 16.9], [D, 20], [B, 60]], [deal900(), deal902])]);
    const { store } = await w.first([[A, 1], [D, 1], [B, 1]]);
    // both: 900's rest is 10 + 60 = 70 < 75. 900 alone: 88.9. 902 alone: 86.9
    expect(store.basket).toEqual([basket902]);
    expect(store.total).toBe(86.9);
  });
});

describe("Compare: ordering and access", () => {
  it("stores sort by the total after the basket saving", async () => {
    const w = await world([
      { key: "yohananof", id: YOHANANOF, items: [[A, 17], [B, 33], [C, 50]], promos: [] }, // nearer, total 100
      osher(shelf, [deal900()]), // Shelf 106.90, total 98.90 with the deal
    ]);
    const stores = await w.compare([[A, 1], [B, 1], [C, 1]], "price");
    expect(stores.map((s) => s.storeId.split("-")[0])).toEqual([OSHER, YOHANANOF]);
    expect(stores.map((s) => s.total)).toEqual([98.9, 100]);
  });

  it("requires a signed-in User", async () => {
    const w = await world([osher(shelf, [deal900()])]);
    const res = await w.post({ ...here, items: [{ code: A, quantity: 1 }] }, false);
    expect(res.status).toBe(401);
  });
});

describe("Compare with a basket deal from real Yohananof files (downloaded 2026-11-04)", () => {
  const fx = (f: string) => readXml(fileURLToPath(new URL(`../__fixtures__/real/${f}`, import.meta.url)));
  // Promotion 373296 "בדין אקסטרה עד 2 יח מעל 75": RT3 8.90 limit 2, on these four (Shelf 16.90); g2 minimum 75.
  const bedin = "7290116536262";
  // Promotion 372709 only: plain RT3 13.90 on a Shelf 16.90 product, so 6 units cost 83.40 whatever else is in the List.
  const cookies = "7622201401900";

  async function yohananof() {
    const w = await world([], new Date("2026-11-04T15:00:00+02:00"));
    ingestStores(w.deps, "yohananof", fx("yohananof-stores.xml"));
    ingestPrices(w.deps, "yohananof", fx("promos/yohananof/PriceFull7290803800003-000-001-20261104-004032.gz"), "PriceFull7290803800003-000-001-20261104-004032.gz");
    ingestPromotions(w.deps, "yohananof", fx("promos/yohananof/PromoFull7290803800003-000-001-20261104-004032.gz"), "PromoFull7290803800003-000-001-20261104-004032.gz");
    ingestPromotions(w.deps, "yohananof", fx("promos/yohananof/Promo7290803800003-000-001-20261104-134000.gz"), "Promo7290803800003-000-001-20261104-134000.gz");
    w.deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, YOHANANOF);
    return w;
  }

  it("the bedin deal applies over a List of 83.40 of other products", async () => {
    const w = await yohananof();
    const { store, by } = await w.first([[bedin, 1], [cookies, 6]]);
    expect(store.basket).toHaveLength(1);
    expect(store.basket![0]).toMatchObject({
      id: "373296", kind: "price", minQty: 1, amount: 8.9, audience: "all", minPurchase: 75, saving: 8,
      text: "₪8.90 במקום ₪16.90 מעל ₪75", codes: [bedin],
    });
    expect(by(bedin)).toMatchObject({ price: 16.9, lineTotal: 16.9 });
    expect(by(bedin)).not.toHaveProperty("promotion");
    expect(store.total).toBe(92.3); // 6 x 13.90 + 16.90 - 8
  });

  it("the bedin product alone gets no basket", async () => {
    const w = await yohananof();
    const { store, by } = await w.first([[bedin, 1]]);
    expect(store).not.toHaveProperty("basket");
    expect(by(bedin).lineTotal).toBe(16.9);
    expect(store.total).toBe(16.9);
  });
});

describe("Compare with a flat-layout spend deal (Keshet MinPurchaseAmnt)", () => {
  const KESHET = "7290785400000";
  // The shape of Keshet store 2's real 191060 "בקניה 100 שח קבל צידנית קשת טעמים ב 9.90" (PromoFull 2026-11-04).
  const flat = (code: string) =>
    `<?xml version="1.0" encoding="utf-8"?><Root><ChainId>${KESHET}</ChainId><SubChainId>1</SubChainId><StoreId>2</StoreId><Promotions><Promotion><PromotionId>191060</PromotionId><PromotionDescription>צידנית ב 9.90 מעל 100</PromotionDescription><PromotionUpdateDate>2024-09-27 00:00</PromotionUpdateDate><PromotionStartDate>2022-02-03</PromotionStartDate><PromotionStartHour>00:00:00</PromotionStartHour><PromotionEndDate>2026-11-28</PromotionEndDate><PromotionEndHour>23:59:00</PromotionEndHour><RewardType>1</RewardType><AllowMultipleDiscounts>1</AllowMultipleDiscounts><IsWeightedPromo>0</IsWeightedPromo><AdditionalRestrictions><AdditionalIsCoupon>0</AdditionalIsCoupon></AdditionalRestrictions><MinQty>1.00</MinQty><MaxQty>1.00</MaxQty><MinPurchaseAmnt>100.00</MinPurchaseAmnt><DiscountedPrice>9.90</DiscountedPrice><DiscountedPricePerMida>9.90</DiscountedPricePerMida><MinNoOfItemOfered>10</MinNoOfItemOfered><PromotionItems><Item><ItemCode>${code}</ItemCode><ItemType>0</ItemType><IsGiftItem>0</IsGiftItem></Item></PromotionItems><Clubs><ClubId>0</ClubId></Clubs></Promotion></Promotions></Root>`;
  const store2 = (xml: string) => xml.replace("<StoreID>1</StoreID>", "<StoreID>2</StoreID>");

  async function keshet() {
    const w = await world([]);
    ingestStores(w.deps, "keshet", store2(storesXml(KESHET)));
    ingestPrices(w.deps, "keshet", store2(pricesXml(KESHET, [[A, 29.9], [B, 60]])), `PriceFull${KESHET}-002-202611040010.xml`);
    ingestPromotions(w.deps, "keshet", flat(A), `PromoFull${KESHET}-002-202611040011.xml`);
    w.deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, KESHET);
    return w;
  }

  it("applies when the rest reaches 100, and not below", async () => {
    const w = await keshet();
    const reached = await w.first([[A, 1], [B, 2]]);
    expect(reached.store.basket).toEqual([
      { id: "191060", kind: "price", minQty: 1, amount: 9.9, audience: "all", text: "₪9.90 במקום ₪29.90 מעל ₪100", minPurchase: 100, saving: 20, codes: [A] },
    ]);
    expect(reached.store.total).toBe(129.9); // 29.90 + 2 x 60 - 20
    const short = await w.first([[A, 1], [B, 1]]);
    expect(short.store).not.toHaveProperty("basket");
    expect(short.store.total).toBe(89.9);
  });
});
