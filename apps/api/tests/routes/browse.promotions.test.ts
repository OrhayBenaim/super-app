import type { ProductType } from "@grocer/shared/product-types";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestPromotions, ingestStores } from "#/ingest/ingest.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeClassifier } from "#/providers/openai/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const here = { lat: 32.0853, lng: 34.7818 };
const WEDNESDAY = new Date("2026-11-04T12:00:00+02:00");
const OSHER = "7290103152017";
const RAMI = "7290058140886";
const YOHANANOF = "7290803800003";
const CHAINS = { [OSHER]: "osher-ad", [RAMI]: "rami-levy", [YOHANANOF]: "yohananof" } as const;
type ChainId = keyof typeof CHAINS;

const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);

// --- builders --------------------------------------------------------------------------------------------------------
type Item = { code: string; name: string; price: number; qty?: number; unit?: string };
type Promo = {
  id: string;
  items: string[];
  /** RewardType: 1 = N for a total, 3 = a unit price, 11 = a kind Grocer can't price (info-only). */
  reward?: 1 | 3 | 11;
  minQty?: number;
  price?: number;
  club?: string;
  coupon?: 0 | 1;
  start?: string;
  end?: string;
  days?: string;
  desc?: string;
};

const storesXml = (chain: ChainId) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: ChainId, items: Item[]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map((i) => `<Item><ItemCode>${i.code}</ItemCode><ItemName>${i.name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${i.unit ?? "יחידות"}</UnitQty><Quantity>${i.qty ?? 1}</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${i.price}</ItemPrice><UnitOfMeasurePrice>${i.price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>${p.desc ?? `מבצע ${p.id}`}</PromotionDescription><PromotionStartDateTime>${p.start ?? "2026-11-01T00:00:00.000"}</PromotionStartDateTime><PromotionEndDateTime>${p.end ?? "2026-11-30T23:59:00.000"}</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays>${p.days ?? ""}</PromotionDays><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>${p.club ?? "0 - כלל הלקוחות"}</ClubID><IsGiftItem /><AdditionalIsCoupon>${p.coupon ?? 0}</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems>${p.items
    .map(
      (code) =>
        `<PromotionItem><ItemCode>${code}</ItemCode><ItemType>1</ItemType><RewardType>${p.reward ?? 3}</RewardType><MinQty>${(p.minQty ?? 1).toFixed(2)}</MinQty><MaxQty></MaxQty><DiscountRate></DiscountRate><DiscountedPrice>${(p.price ?? 0).toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${(p.price ?? 0).toFixed(2)}</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem>`,
    )
    .join("")}</PromotionItems></Group></Groups></Promotion>`;
const promosXml = (chain: ChainId, promos: Promo[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`;

type Setup = { chain: ChainId; at: { lat: number; lng: number }; items: Item[]; promos: Promo[] };

/**
 * One store per Chain at `at`, loaded through the ingest functions, then one Price sync over an empty portal so the
 * fake classifier types the Products from `types` (a name not in it is Other).
 */
async function world(setups: Setup[], types: Record<string, ProductType>) {
  const deps = buildDeps(loadConfig(), {
    clock: fakeClock(WEDNESDAY),
    pricePortal: fakePricePortal({}),
    classifier: fakeClassifier(types),
    errorHandler: fakeErrorHandler(),
  });
  const setPos = deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?");
  for (const s of setups) {
    ingestStores(deps, CHAINS[s.chain], storesXml(s.chain));
    ingestPrices(deps, CHAINS[s.chain], pricesXml(s.chain, s.items), `PriceFull${s.chain}-001-001-20261104-000000.xml`);
    ingestPromotions(deps, CHAINS[s.chain], promosXml(s.chain, s.promos), `PromoFull${s.chain}-001-001-20261104-010000.xml`);
    setPos.run(s.at.lat, s.at.lng, s.chain);
  }
  await priceSyncJob(deps)({}); // every Chain fails (no files); the Product type step still runs
  const app = createApp(deps);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "promos@browse.test", password: "password1234", name: "Pia" }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { app, cookie };
}

// --- the world -------------------------------------------------------------------------------------------------------
const litre = { qty: 1, unit: "ליטר" };
const g = (qty: number) => ({ qty, unit: "גרם" });
const [M3, M1, BAMBA, COFFEE, CHOC, CHOC2, SOON, EGGS] = ["01", "02", "03", "04", "05", "06", "07", "08"].map((n) => gtin(`72900010000${n}`));
const MILK3 = { code: M3!, name: "חלב תנובה 3% 1 ליטר", ...litre };
const MILK1 = { code: M1!, name: "חלב טרה 1% 1 ליטר", ...litre };
const SNACK = { code: BAMBA!, name: "במבה אסם 80 גרם", ...g(80) };
const INSTANT = { code: COFFEE!, name: "קפה נמס 200 גרם", ...g(200) };
const ENDED = { code: CHOC!, name: "שוקולד מריר 100 גרם", ...g(100) };
const SUNDAYS = { code: CHOC2!, name: "וופל לימון 200 גרם", ...g(200) };
const LATER = { code: SOON!, name: "עוגיות שוקולד 300 גרם", ...g(300) };
const EGG = { code: EGGS!, name: "ביצים L 12 יח" };

const TYPES: Record<string, ProductType> = {
  [MILK3.name]: "dairy-eggs", [MILK1.name]: "dairy-eggs", [EGG.name]: "dairy-eggs", [SNACK.name]: "snacks-sweets",
  [ENDED.name]: "snacks-sweets", [SUNDAYS.name]: "snacks-sweets", [LATER.name]: "snacks-sweets", [INSTANT.name]: "pantry",
};

let app: Awaited<ReturnType<typeof world>>["app"];
let cookie: string;

beforeAll(async () => {
  ({ app, cookie } = await world(
    [
      {
        chain: OSHER,
        at: here,
        items: [
          { ...MILK3, price: 6.9 }, { ...MILK1, price: 6.4 }, { ...SNACK, price: 4 }, { ...INSTANT, price: 30 },
          { ...ENDED, price: 8 }, { ...SUNDAYS, price: 9 }, { ...LATER, price: 12 },
        ],
        promos: [
          { id: "1", items: [M3!], price: 4.9 }, // 29% off
          { id: "2", items: [BAMBA!], reward: 1, minQty: 3, price: 9 }, // 3 for ₪9: ₪3 a pack, 25% off
          { id: "3", items: [COFFEE!], reward: 11, desc: "1+1 על קפה נמס" }, // no price we can work out
          { id: "4", items: [CHOC!], price: 5, end: "2026-11-03T23:59:00.000" }, // ended yesterday
          { id: "5", items: [CHOC2!], price: 5, days: "1" }, // Sundays only (today is Wednesday)
          { id: "6", items: [SOON!], price: 6, start: "2026-11-05T00:00:00.000" }, // starts tomorrow
        ],
      },
      {
        chain: RAMI,
        at: { lat: here.lat + 0.009, lng: here.lng }, // about 1 km away
        items: [{ ...MILK3, price: 6.5 }, { ...SNACK, price: 4.2 }],
        promos: [{ id: "7", items: [M3!], price: 4.5, club: "2" }], // Rami Levy's credit card: 31% off, the lowest price
      },
      {
        chain: YOHANANOF,
        at: { lat: here.lat + 0.5, lng: here.lng }, // about 55 km away: outside the radius
        items: [{ ...EGG, price: 14 }, { ...MILK3, price: 6 }],
        promos: [{ id: "8", items: [EGGS!, M3!], price: 3 }],
      },
    ],
    TYPES,
  ));
});

type PromoCard = {
  ref: string; name: string; codes: string[]; promoPrice: number | null; shelfPrice: number | null; saving: number | null;
  kind: string; audience: string; text: string; chainCount: number;
};
const near = `lat=${here.lat}&lng=${here.lng}&radiusKm=10`;
const get = (path: string, auth = true) => app.request(path, { headers: auth ? { cookie } : {} });
const cards = async (query = "") => {
  const res = await get(`/api/browse/promotions?${near}${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as PromoCard[];
};

describe("GET /api/browse/promotions", () => {
  it("shows a card per group with a Promotion running now nearby, biggest saving first, no-price ones last", async () => {
    expect((await cards()).map((c) => [c.ref, c.saving])).toEqual([
      ["חלב|l", 31],
      ["במבה|kg", 25],
      ["קפה|kg", null],
    ]);
  });

  it("builds a card only from the Products on a Promotion", async () => {
    const milk = (await cards()).find((c) => c.ref === "חלב|l")!;
    expect(milk.codes).toEqual([M3]); // not the 1% milk, which has no Promotion
  });

  it("headlines the lowest Promotion price with its Shelf price, and says when it is Restricted and to what", async () => {
    expect((await cards()).find((c) => c.ref === "חלב|l")).toMatchObject({
      promoPrice: 4.5, shelfPrice: 6.5, saving: 31, kind: "price", audience: "card", text: "₪4.50 במקום ₪6.50", chainCount: 2,
    });
  });

  it("prices a pack group per kilo or liter, a set Promotion averaged over its set", async () => {
    expect((await cards()).find((c) => c.ref === "במבה|kg")).toMatchObject({
      promoPrice: 37.5, shelfPrice: 50, saving: 25, kind: "bundle", audience: "all", text: "3 ב-₪9", chainCount: 1,
    });
  });

  it("gives a Promotion with no price its Chain's own description", async () => {
    expect((await cards()).find((c) => c.ref === "קפה|kg")).toMatchObject({
      promoPrice: null, shelfPrice: null, saving: null, kind: "info", audience: "all", text: "1+1 על קפה נמס", chainCount: 1,
    });
  });

  it("filters by Product type", async () => {
    expect((await cards("&type=snacks-sweets")).map((c) => c.ref)).toEqual(["במבה|kg"]);
  });

  it("filters by Chain: only that Chain's Promotions and Shelf prices count", async () => {
    expect(await cards(`&chain=${OSHER}`)).toEqual([
      expect.objectContaining({ ref: "חלב|l", promoPrice: 4.9, shelfPrice: 6.9, saving: 29, audience: "all", chainCount: 1 }),
      expect.objectContaining({ ref: "במבה|kg" }),
      expect.objectContaining({ ref: "קפה|kg" }),
    ]);
  });

  it("combines both filters, and is empty when they match nothing", async () => {
    expect((await cards(`&chain=${RAMI}&type=dairy-eggs`)).map((c) => c.ref)).toEqual(["חלב|l"]);
    expect(await cards(`&chain=${RAMI}&type=pantry`)).toEqual([]);
  });

  it("is empty without a location", async () => {
    const res = await get("/api/browse/promotions");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns 400 for a bad type, Chain or location", async () => {
    for (const q of ["&type=sweets", "&chain=osher"]) expect((await get(`/api/browse/promotions?${near}${q}`)).status).toBe(400);
    expect((await get(`/api/browse/promotions?lat=${here.lat}&lng=${here.lng}&radiusKm=0`)).status).toBe(400);
    expect((await get("/api/browse/promotions?lat=32")).status).toBe(400);
  });

  it("returns 401 when signed out", async () => {
    expect((await get(`/api/browse/promotions?${near}`, false)).status).toBe(401);
  });
});
