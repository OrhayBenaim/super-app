import type { ProductType } from "@grocer/shared/product-types";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakeClassifier } from "#/providers/openai/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const here = { lat: 32.0853, lng: 34.7818 };
// Store names place the stores: "near" at `here`, "close" about 1 km away, "far" about 55 km away (outside 10 km).
const PLACES: Record<string, { lat: number; lng: number }> = {
  near: here,
  close: { lat: here.lat + 0.009, lng: here.lng },
  far: { lat: here.lat + 0.5, lng: here.lng },
};

// qty + unit read "500 גרם"; w = sold by the kilo.
type Item = { code: string; name: string; price: number; qty?: number; unit?: string; w?: boolean };
const enc = (s: string) => new TextEncoder().encode(s);
const storesXml = `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>001</SubChainID><Stores>${Object.keys(PLACES)
  .map((name, i) => `<Store><StoreID>${i + 1}</StoreID><StoreName>${name}</StoreName><Address>רחוב ${i + 1}</Address><City>תל אביב</City></Store>`)
  .join("")}</Stores></SubChain></SubChains></Root>`;
const item = (i: Item) =>
  `<Item><PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>${i.code}</ItemCode><ItemType>1</ItemType><ItemName>${i.name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${i.unit ?? "יחידות"}</UnitQty><Quantity>${i.qty ?? 1}</Quantity><bIsWeighted>${i.w ? 1 : 0}</bIsWeighted><ItemPrice>${i.price}</ItemPrice><UnitOfMeasurePrice>${i.price}</UnitOfMeasurePrice><ItemStatus>1</ItemStatus></Item>`;
const pricesXml = (store: number, items: Item[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><Items Count="${items.length}">${items.map(item).join("")}</Items></Root>`;

/**
 * A database seeded the way production is: one Price sync of Osher Ad's stores "near", "close" and "far" with these
 * items, typed by the fake classifier from `types` (a name not in it is Other; null leaves it untyped).
 */
async function world(byStore: { near?: Item[]; close?: Item[]; far?: Item[] }, types: Record<string, ProductType | null>) {
  const files: Record<string, Uint8Array> = { [`Stores${OSHER}-000-20261021-080500.xml`]: enc(storesXml) };
  Object.keys(PLACES).forEach((name, i) => {
    const items = byStore[name as keyof typeof byStore];
    if (items) files[`PriceFull${OSHER}-001-00${i + 1}-20261021-051600.xml`] = enc(pricesXml(i + 1, items));
  });
  const deps = buildDeps(loadConfig(), {
    pricePortal: fakePricePortal(files),
    geocoder: fakeGeocoder((p) => PLACES[p.name] ?? null),
    classifier: fakeClassifier(types),
  });
  await priceSyncJob(deps)({});
  const app = createApp(deps);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "browse@browse.test", password: "password1234", name: "Bea" }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { app, cookie };
}

const sku = (code: string) => `${OSHER}:${code}`; // test codes are not GTINs, so Products are keyed by their Chain
const litre = { qty: 1, unit: "ליטר" };
const g = (qty: number) => ({ qty, unit: "גרם" });

const MILK3 = { code: "1", name: "חלב תנובה 3% 1 ליטר", ...litre };
const MILK1 = { code: "2", name: "חלב טרה 1% 1 ליטר", ...litre };
const POWDER = { code: "3", name: "חלב אבקה 400 גרם", ...g(400) };
const EGGS = { code: "4", name: "ביצים L 12 יח" };
const KEFIR = { code: "5", name: "קפיר 500 מל", qty: 500, unit: "מל" };
const SHOKO = { code: "6", name: "חלב שוקו 1 ליטר", ...litre };
const BAMBA = { code: "7", name: "במבה אסם 80 גרם", ...g(80) };
const BAMBA_NOUGAT = { code: "8", name: "במבה נוגט 60 גרם", ...g(60) };
const CHOCOLATE = { code: "9", name: "שוקולד חלב 100 גרם", ...g(100) };
const SOAP = { code: "10", name: "סבון ידיים" };
const WIPES = { code: "11", name: "מגבונים 80 יח" };
const TUNA = { code: "12", name: "טונה בשמן 160 גרם", ...g(160) };

const TYPES: Record<string, ProductType | null> = {
  [MILK3.name]: "dairy-eggs", [MILK1.name]: "dairy-eggs", [POWDER.name]: "dairy-eggs", [EGGS.name]: "dairy-eggs", [KEFIR.name]: "dairy-eggs",
  [SHOKO.name]: "drinks", [BAMBA.name]: "snacks-sweets", [BAMBA_NOUGAT.name]: "snacks-sweets", [CHOCOLATE.name]: "snacks-sweets",
  [TUNA.name]: "canned", [WIPES.name]: null, // untyped: the classifier's answer was outside the list
};

let app: Awaited<ReturnType<typeof world>>["app"];
let cookie: string;

beforeAll(async () => {
  ({ app, cookie } = await world(
    {
      near: [
        { ...MILK3, price: 6 }, { ...MILK1, price: 6.4 }, { ...POWDER, price: 20 }, { ...EGGS, price: 14 }, { ...KEFIR, price: 5 },
        { ...SHOKO, price: 7 }, { ...BAMBA, price: 4 }, { ...BAMBA_NOUGAT, price: 4.5 }, { ...CHOCOLATE, price: 6 },
        { ...SOAP, price: 9 }, { ...WIPES, price: 10 },
      ],
      close: [{ ...MILK3, price: 5.5 }, { ...BAMBA_NOUGAT, price: 4.2 }],
      far: [{ ...MILK3, price: 4 }, { ...TUNA, price: 8 }],
    },
    TYPES,
  ));
});

const near = `lat=${here.lat}&lng=${here.lng}&radiusKm=10`;
const get = (path: string, auth = true) => app.request(path, { headers: auth ? { cookie } : {} });
const json = async (path: string) => {
  const res = await get(path);
  expect(res.status).toBe(200);
  return res.json();
};

describe("GET /api/browse/types", () => {
  it("lists the Product types sold nearby in the fixed order, Other last, each with its count of group cards", async () => {
    expect(await json(`/api/browse/types?${near}`)).toEqual([
      { type: "dairy-eggs", cardCount: 4 },
      { type: "drinks", cardCount: 1 },
      { type: "snacks-sweets", cardCount: 2 },
      { type: "other", cardCount: 2 }, // the soap, and the untyped wipes
    ]);
  });

  it("without a location lists every Product type with a current price anywhere", async () => {
    expect(await json("/api/browse/types")).toEqual([
      { type: "dairy-eggs", cardCount: 4 },
      { type: "drinks", cardCount: 1 },
      { type: "snacks-sweets", cardCount: 2 },
      { type: "canned", cardCount: 1 },
      { type: "other", cardCount: 2 },
    ]);
  });

  it("is 401 signed out and 400 for a bad location", async () => {
    expect((await get(`/api/browse/types?${near}`, false)).status).toBe(401);
    for (const q of ["lat=abc&lng=34", `lat=${here.lat}`, `lng=${here.lng}`, `${near.replace("radiusKm=10", "radiusKm=100")}`, "lat=91&lng=34"]) {
      expect((await get(`/api/browse/types?${q}`)).status, q).toBe(400);
    }
  });
});

type Card = { ref: string; name: string; measure: string; soldBy: string; size: number; code: string; minPrice: number | null; storeCount: number };
const cards = async (type: string, query = near) => (await json(`/api/browse/types/${type}?${query}`)) as Card[];

describe("GET /api/browse/types/:type", () => {
  it("makes one card per first word and measure, most nearby stores first, then by name, with the cheapest nearby price", async () => {
    expect(await cards("dairy-eggs")).toEqual([
      // the far store's ₪4 milk is outside the radius
      { ref: "חלב|l", name: "חלב", measure: "l", soldBy: "unit", size: 1, code: sku(MILK3.code), minPrice: 5.5, storeCount: 2 },
      { ref: "ביצ|unit|12", name: "ביצים", measure: "unit", soldBy: "unit", size: 12, code: sku(EGGS.code), minPrice: 14, storeCount: 1 },
      { ref: "חלב|kg", name: "חלב", measure: "kg", soldBy: "unit", size: 0.4, code: sku(POWDER.code), minPrice: 50, storeCount: 1 },
      // a Product that shares its first word with nothing still gets a card
      { ref: "קפיר|l", name: "קפיר", measure: "l", soldBy: "unit", size: 0.5, code: sku(KEFIR.code), minPrice: 10, storeCount: 1 },
    ]);
  });

  it("keeps cards apart per Product type: chocolate milk is a drinks card, not part of the dairy milk card", async () => {
    expect(await cards("drinks")).toEqual([expect.objectContaining({ ref: "חלב|l", code: sku(SHOKO.code), minPrice: 7, storeCount: 1 })]);
    expect((await cards("snacks-sweets")).map((c) => [c.ref, c.storeCount, c.minPrice])).toEqual([["במבה|kg", 2, 50], ["שוקולד|kg", 1, 60]]);
  });

  it("counts untyped Products as Other", async () => {
    expect((await cards("other")).map((c) => c.code).sort()).toEqual([sku(SOAP.code), sku(WIPES.code)].sort());
  });

  it("hides groups not sold nearby", async () => {
    expect(await cards("canned")).toEqual([]);
  });

  it("without a location shows every group with no prices, store counts over every store", async () => {
    expect((await cards("dairy-eggs", "")).slice(0, 1)).toEqual([expect.objectContaining({ ref: "חלב|l", minPrice: null, storeCount: 3 })]);
    expect(await cards("canned", "")).toEqual([expect.objectContaining({ ref: "טונה|kg", code: sku(TUNA.code), minPrice: null, storeCount: 1 })]);
  });

  it("is 401 signed out and 400 for an unknown Product type or a bad location", async () => {
    expect((await get(`/api/browse/types/dairy-eggs?${near}`, false)).status).toBe(401);
    expect((await get(`/api/browse/types/sweets?${near}`)).status).toBe(400);
    expect((await get(`/api/browse/types/dairy-eggs?lat=${here.lat}`)).status).toBe(400);
  });
});
