import type { ProductType } from "@grocer/shared/product-types";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPromotions } from "#/ingest/ingest.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakeClassifier } from "#/providers/openai/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const OSHER = "7290103152017";
const here = { lat: 32.0853, lng: 34.7818 };
// Store names place the stores: "near" at `here`, "close" about 1 km away, "far" about 55 km away; the others have no location.
const PLACES: Record<string, { lat: number; lng: number }> = { near: here, close: { lat: here.lat + 0.009, lng: here.lng }, far: { lat: here.lat + 0.5, lng: here.lng } };
const MANY = 105;
const names = ["near", "close", "far", "nowhere", ...Array.from({ length: MANY }, (_, i) => `n${i}`)];

const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const [MILK, TIE, WEIGHED, COMMON] = ["01", "02", "03", "04"].map((n) => gtin(`72900010000${n}`)) as [string, string, string, string];
const labels = { [MILK]: "חלב תנובה 3% 1 ליטר", [TIE]: "במבה אסם 80 גרם", [WEIGHED]: "עגבניות", [COMMON]: "סוכר 1 קילוגרם" };
type Item = { code: string; price: number };
const unitOf = { [MILK]: [1, "ליטר", 0], [TIE]: [80, "גרם", 0], [WEIGHED]: [1, "קילוגרם", 1], [COMMON]: [1, "קילוגרם", 0] } as const;
const enc = (s: string) => new TextEncoder().encode(s);
const xmlItem = ({ code, price }: Item) => {
  const [qty, unit, weighed] = unitOf[code as keyof typeof unitOf];
  return `<Item><PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>${code}</ItemCode><ItemType>1</ItemType><ItemName>${labels[code as keyof typeof labels]}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${unit}</UnitQty><Quantity>${qty}</Quantity><bIsWeighted>${weighed}</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice><ItemStatus>1</ItemStatus></Item>`;
};
const storesXml = `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>001</SubChainID><Stores>${names
  .map((name, i) => `<Store><StoreID>${i + 1}</StoreID><StoreName>${name}</StoreName><Address>רחוב ${i + 1}</Address><City>תל אביב</City></Store>`)
  .join("")}</Stores></SubChain></SubChains></Root>`;
const pricesXml = (store: number, items: Item[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><Items Count="${items.length}">${items.map(xmlItem).join("")}</Items></Root>`;
// Store 1 ("near"): the milk at ₪4.9.
const promoXml = `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions><Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>1</PromotionID><PromotionDescription>מבצע חלב</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-11-30T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays></PromotionDays><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems><PromotionItem><ItemCode>${MILK}</ItemCode><ItemType>1</ItemType><RewardType>3</RewardType><MinQty>1.00</MinQty><MaxQty></MaxQty><DiscountRate></DiscountRate><DiscountedPrice>4.90</DiscountedPrice><DiscountedPricePerMida>4.90</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem></PromotionItems></Group></Groups></Promotion></Promotions></Root>`;

const TYPES: Record<string, ProductType> = { [labels[MILK]]: "dairy-eggs", [labels[TIE]]: "snacks-sweets", [labels[WEIGHED]]: "produce" };

let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  const files: Record<string, Uint8Array> = { [`Stores${OSHER}-000-20261104-080500.xml`]: enc(storesXml) };
  const byStore: Record<string, Item[]> = {
    near: [{ code: MILK, price: 6 }, { code: TIE, price: 3 }, { code: WEIGHED, price: 12 }],
    close: [{ code: MILK, price: 5.5 }, { code: TIE, price: 3 }, { code: WEIGHED, price: 10 }],
    far: [{ code: MILK, price: 4 }, { code: TIE, price: 3 }],
    nowhere: [{ code: MILK, price: 3 }],
  };
  names.forEach((n, i) => {
    const items = byStore[n] ?? [{ code: COMMON, price: 5 + i / 100 }];
    files[`PriceFull${OSHER}-001-${String(i + 1).padStart(3, "0")}-20261104-051600.xml`] = enc(pricesXml(i + 1, items));
  });
  const deps = buildDeps(loadConfig(), {
    clock: fakeClock(new Date("2026-11-04T12:00:00+02:00")),
    pricePortal: fakePricePortal(files),
    geocoder: fakeGeocoder((p) => PLACES[p.name] ?? null),
    classifier: fakeClassifier(TYPES),
  });
  await priceSyncJob(deps)({});
  ingestPromotions(deps, "osher-ad", promoXml, `PromoFull${OSHER}-001-001-20261104-010000.xml`);
  app = createApp(deps);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "pp@browse.test", password: "password1234", name: "Pia" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

const near = `lat=${here.lat}&lng=${here.lng}&radiusKm=10`;
const get = (path: string, auth = true) => app.request(path, { headers: auth ? { cookie } : {} });
type Row = { chainName: string; storeName: string; distanceKm?: number; lat: number | null; lng: number | null; price: number; promoPrice: number | null; promoText: string | null };
type Page = { product: Record<string, unknown>; stores: Row[] };
const page = async (code: string, query = "") => {
  const res = await get(`/api/browse/products/${encodeURIComponent(code)}?${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Page;
};

describe("GET /api/browse/products/:code", () => {
  it("returns the Product and, with a location, only stores within the radius, cheapest first, with distance and a Promotion that lowers the price", async () => {
    const p = await page(MILK, near);
    expect(p.product).toEqual({ code: MILK, name: labels[MILK], measure: "l", size: 1, soldBy: "unit", type: "dairy-eggs" });
    // far is outside the radius; near's Promotion makes it the cheapest
    expect(p.stores.map((s) => [s.storeName, s.price, s.promoPrice])).toEqual([["near", 6, 4.9], ["close", 5.5, null]]);
    expect(p.stores[0]).toMatchObject({ chainName: expect.any(String), distanceKm: 0, lat: here.lat, lng: here.lng, promoText: expect.any(String) });
    expect(p.stores[1]!.distanceKm).toBeCloseTo(1, 0);
  });

  it("puts the nearer store first on a tie", async () => {
    expect((await page(TIE, near)).stores.map((s) => s.storeName)).toEqual(["near", "close"]);
  });

  it("without a location lists every store that prices it, past 100, cheapest first, with no distance", async () => {
    const p = await page(COMMON);
    expect(p.stores).toHaveLength(MANY);
    expect(p.stores.map((s) => s.price)).toEqual(p.stores.map((s) => s.price).sort((a, b) => a - b));
    expect(p.stores.some((s) => "distanceKm" in s)).toBe(false);
    expect((await page(MILK)).stores.map((s) => s.storeName)).toEqual(["nowhere", "far", "near", "close"]);
  });

  it("gives a store with no location null coordinates", async () => {
    expect((await page(MILK)).stores[0]).toMatchObject({ storeName: "nowhere", lat: null, lng: null });
  });

  it("prices a Product sold by weight per kilo", async () => {
    const p = await page(WEIGHED, near);
    expect(p.product).toMatchObject({ measure: "kg", size: 1, soldBy: "weight" });
    expect(p.stores.map((s) => s.price)).toEqual([10, 12]);
  });

  it("is 404 for a code no store prices, 400 for a bad code or lat without lng, 401 signed out", async () => {
    expect((await get("/api/browse/products/nope")).status).toBe(404);
    expect((await get(`/api/browse/products/${"9".repeat(65)}`)).status).toBe(400);
    expect((await get(`/api/browse/products/${MILK}?lat=32`)).status).toBe(400);
    expect((await get(`/api/browse/products/${MILK}`, false)).status).toBe(401);
  });
});
