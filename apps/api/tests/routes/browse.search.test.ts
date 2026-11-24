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
const PLACES: Record<string, { lat: number; lng: number }> = { near: here, close: { lat: here.lat + 0.009, lng: here.lng }, far: { lat: here.lat + 0.5, lng: here.lng } };

type Item = { code: string; name: string; price: number; qty?: number; unit?: string };
const enc = (s: string) => new TextEncoder().encode(s);
const storesXml = `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>001</SubChainID><Stores>${Object.keys(PLACES)
  .map((name, i) => `<Store><StoreID>${i + 1}</StoreID><StoreName>${name}</StoreName><Address>רחוב ${i + 1}</Address><City>תל אביב</City></Store>`)
  .join("")}</Stores></SubChain></SubChains></Root>`;
const item = (i: Item) =>
  `<Item><PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>${i.code}</ItemCode><ItemType>1</ItemType><ItemName>${i.name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${i.unit ?? "יחידות"}</UnitQty><Quantity>${i.qty ?? 1}</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${i.price}</ItemPrice><UnitOfMeasurePrice>${i.price}</UnitOfMeasurePrice><ItemStatus>1</ItemStatus></Item>`;
const pricesXml = (store: number, items: Item[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><Items Count="${items.length}">${items.map(item).join("")}</Items></Root>`;

const sku = (code: string) => `${OSHER}:${code}`; // test codes are not GTINs, so Products are keyed by their Chain
const litre = { qty: 1, unit: "ליטר" };
const MILK3 = { code: "1", name: "חלב תנובה 3% 1 ליטר", ...litre };
const MILK1 = { code: "2", name: "חלב טרה 1% 1 ליטר", ...litre };
const FAR_ONLY = { code: "3", name: "חלב רחוק 1 ליטר", ...litre };
const SOLO = { code: "4", name: "חלבון אבקה 400 גרם", qty: 400, unit: "גרם" };
// 105 distinct Products (distinct words and sizes, so no group forms) that one query matches
const letter = (n: number) => String.fromCharCode(0x5d0 + n);
const MANY = Array.from({ length: 105 }, (_, i): Item => ({ code: `m${i}`, name: `זנגביל ${letter(i % 22)}${letter(Math.floor(i / 22))} ${100 + i} גרם`, price: 3, qty: 100 + i, unit: "גרם" }));
const TYPES: Record<string, ProductType | null> = { [MILK3.name]: "dairy-eggs", [MILK1.name]: "dairy-eggs", [FAR_ONLY.name]: "dairy-eggs", [SOLO.name]: "dairy-eggs" };

let app: ReturnType<typeof createApp>;
let cookie: string;

beforeAll(async () => {
  const byStore: Record<string, Item[]> = {
    near: [{ ...MILK3, price: 6 }, { ...MILK1, price: 6.4 }, { ...SOLO, price: 20 }, ...MANY],
    close: [{ ...MILK3, price: 5.5 }, { ...SOLO, price: 19 }],
    far: [{ ...MILK3, price: 4 }, { ...FAR_ONLY, price: 3 }],
  };
  const files: Record<string, Uint8Array> = { [`Stores${OSHER}-000-20261021-080500.xml`]: enc(storesXml) };
  Object.keys(PLACES).forEach((name, i) => (files[`PriceFull${OSHER}-001-00${i + 1}-20261021-051600.xml`] = enc(pricesXml(i + 1, byStore[name]!))));
  const deps = buildDeps(loadConfig(), { pricePortal: fakePricePortal(files), geocoder: fakeGeocoder((p) => PLACES[p.name] ?? null), classifier: fakeClassifier(TYPES) });
  await priceSyncJob(deps)({});
  app = createApp(deps);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "s@browse.test", password: "password1234", name: "Sia" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

const near = `lat=${here.lat}&lng=${here.lng}&radiusKm=10`;
const get = (path: string, auth = true) => app.request(path, { headers: auth ? { cookie } : {} });
type Card = { type: string; ref: string | null; name: string; code: string; minPrice: number | null; storeCount: number; codes: string[] };
const search = async (q: string, query = "") => {
  const res = await get(`/api/browse/search?q=${encodeURIComponent(q)}&${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Card[];
};

describe("GET /api/browse/search", () => {
  it("returns Product group cards first, then single Products, each with the most nearby stores first", async () => {
    const cards = await search("חלב", near);
    const firstProduct = cards.findIndex((c) => c.ref === null);
    expect(firstProduct).toBeGreaterThan(0);
    expect(cards.slice(0, firstProduct).every((c) => c.ref !== null)).toBe(true);
    expect(cards.slice(firstProduct).every((c) => c.ref === null)).toBe(true);
    for (const part of [cards.slice(0, firstProduct), cards.slice(firstProduct)])
      expect(part.map((c) => c.storeCount)).toEqual(part.map((c) => c.storeCount).sort((a, b) => b - a));
  });

  it("with a location returns only what is sold nearby, priced at nearby stores", async () => {
    const cards = await search("חלב", near);
    expect(cards.map((c) => c.name)).not.toContain(FAR_ONLY.name);
    expect(cards.find((c) => c.code === sku(MILK3.code) && c.ref === null)).toMatchObject({ minPrice: 5.5, storeCount: 2, codes: [sku(MILK3.code)] });
    expect(cards.find((c) => c.ref !== null)!.minPrice).toBe(5.5);
  });

  it("without a location returns every match, unpriced", async () => {
    const cards = await search("חלב");
    expect(cards.map((c) => c.name)).toContain(FAR_ONLY.name);
    expect(cards.every((c) => c.minPrice === null)).toBe(true);
  });

  it("returns a Product in no group as a card without a group ref", async () => {
    const cards = await search("חלבון", near);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ ref: null, type: "dairy-eggs", code: sku(SOLO.code), name: SOLO.name, storeCount: 2, minPrice: 47.5 });
  });

  it("without a location returns a Product in no group too, unpriced", async () => {
    const cards = await search("חלבון");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ ref: null, code: sku(SOLO.code), storeCount: 2, minPrice: null });
  });

  it("returns at most 100 cards", async () => {
    expect(await search("זנגביל", near)).toHaveLength(100);
  });

  it("is 400 for a q outside the SEARCH rule or lat without lng, 401 signed out", async () => {
    expect((await get("/api/browse/search?q=ח")).status).toBe(400);
    expect((await get("/api/browse/search")).status).toBe(400);
    expect((await get(`/api/browse/search?q=${"ח".repeat(101)}`)).status).toBe(400);
    expect((await get("/api/browse/search?q=חלב&lat=32")).status).toBe(400);
    expect((await get("/api/browse/search?q=חלב", false)).status).toBe(401);
  });
});
