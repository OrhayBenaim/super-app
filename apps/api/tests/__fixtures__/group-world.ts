// A database seeded by one Price sync of Osher Ad's stores "near" and "close", for the editable Product groups tests
// (docs/adr/0007): milk by the liter, a chocolate milk, milk powder (by the kilo) and two soy drinks, all Dairy and eggs.
import type { ProductType } from "@grocer/shared/product-types";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakeClassifier } from "#/providers/openai/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";

export const OSHER = "7290103152017";
export const TOKEN = "test-sync-token";
export const here = { lat: 32.0853, lng: 34.7818 };
const PLACES: Record<string, { lat: number; lng: number }> = { near: here, close: { lat: here.lat + 0.009, lng: here.lng } };

type Item = { code: string; name: string; price: number; qty: number; unit: string };
const enc = (s: string) => new TextEncoder().encode(s);
const storesXml = `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>001</SubChainID><Stores>${Object.keys(PLACES)
  .map((name, i) => `<Store><StoreID>${i + 1}</StoreID><StoreName>${name}</StoreName><Address>רחוב ${i + 1}</Address><City>תל אביב</City></Store>`)
  .join("")}</Stores></SubChain></SubChains></Root>`;
const item = (i: Item) =>
  `<Item><PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>${i.code}</ItemCode><ItemType>1</ItemType><ItemName>${i.name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${i.unit}</UnitQty><Quantity>${i.qty}</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${i.price}</ItemPrice><UnitOfMeasurePrice>${i.price}</UnitOfMeasurePrice><ItemStatus>1</ItemStatus></Item>`;
const pricesXml = (store: number, items: Item[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><Items Count="${items.length}">${items.map(item).join("")}</Items></Root>`;

export const sku = (code: string) => `${OSHER}:${code}`; // test codes are not GTINs, so Products are keyed by their Chain
const litre = { qty: 1, unit: "ליטר" };
export const MILK3 = { code: "1", name: "חלב תנובה 3% 1 ליטר", ...litre };
export const MILK1 = { code: "2", name: "חלב טרה 1% 1 ליטר", ...litre };
export const SHOKO = { code: "3", name: "חלב שוקו 1 ליטר", ...litre };
export const POWDER = { code: "4", name: "חלב אבקה 400 גרם", qty: 400, unit: "גרם" };
export const SOY = { code: "5", name: "משקה סויה אלפרו 1 ליטר", ...litre };
export const SOY_LIGHT = { code: "6", name: "משקה סויה ללא סוכר 1 ליטר", ...litre };

export const NEAR = [
  { ...MILK3, price: 6 }, { ...MILK1, price: 5 }, { ...SHOKO, price: 4 }, { ...POWDER, price: 20 }, { ...SOY, price: 9 }, { ...SOY_LIGHT, price: 8.9 },
];
export const CLOSE = [{ ...MILK3, price: 5.5 }, { ...SOY, price: 9.5 }];

/** Both apps over one Price sync of `near` and `close`, every Product Dairy and eggs, and a signed-up User's cookie. */
export async function groupWorld({ near = NEAR, close = CLOSE }: { near?: Item[]; close?: Item[] } = {}) {
  const files: Record<string, Uint8Array> = {
    [`Stores${OSHER}-000-20261021-080500.xml`]: enc(storesXml),
    [`PriceFull${OSHER}-001-001-20261021-051600.xml`]: enc(pricesXml(1, near)),
    [`PriceFull${OSHER}-001-002-20261021-051600.xml`]: enc(pricesXml(2, close)),
  };
  const deps = buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }), {
    pricePortal: fakePricePortal(files),
    geocoder: fakeGeocoder((p) => PLACES[p.name] ?? null),
    classifier: fakeClassifier((): ProductType => "dairy-eggs"),
  });
  await priceSyncJob(deps)({});
  const app = createApp(deps);
  const internal = createInternalApp(deps);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "groups@groups.test", password: "password1234", name: "Gal" }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  /** A public request as the signed-up User; `body` is sent as JSON. */
  const user = (path: string, method = "GET", body?: unknown) =>
    app.request(path, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  /** A private request with the token (or `auth`); `body` is sent as JSON. */
  const team = (path: string, method = "GET", body?: unknown, auth = `Bearer ${TOKEN}`) =>
    internal.request(path, { method, headers: { Authorization: auth, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { deps, user, team, files };
}

export const near = `lat=${here.lat}&lng=${here.lng}&radiusKm=10`;
