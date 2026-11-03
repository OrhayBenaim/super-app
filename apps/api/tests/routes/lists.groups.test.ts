import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { linkProduceItems } from "#/db/index.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const milk = "7290000066318"; // a GTIN
let app: ReturnType<typeof createApp>;
let deps: ReturnType<typeof buildDeps>;
let cookie: string;
let listId: string;

const call = (method: string, path: string, body?: unknown, auth = true) =>
  app.request(`/api/lists${path}`, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const addItem = async (body: Record<string, unknown>) => (await call("POST", `/${listId}/items`, { category: "Pantry", ...body })).json();
const row = (id: string) => deps.db.$client.prepare("SELECT product_code AS productCode, group_ref AS groupRef FROM items WHERE id = ?").get(id) as { productCode: string | null; groupRef: string | null };

beforeAll(async () => {
  deps = buildDeps(loadConfig());
  app = createApp(deps);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "groups@lists.test", password: "password1234", name: "Gal" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  listId = (await (await call("GET", "")).json())[0].id;
});

describe("items matched to a Product group", () => {
  it("creates an item with a groupRef and returns it in list detail", async () => {
    const item = await addItem({ name: "Bulgur", groupRef: "בורגול|kg" });
    expect(item).toMatchObject({ name: "Bulgur", groupRef: "בורגול|kg", productCode: "בורגול|kg" });
    const detail = await (await call("GET", `/${listId}`)).json();
    expect(detail.items.find((i: { id: string }) => i.id === item.id)).toMatchObject({ groupRef: "בורגול|kg", productCode: "בורגול|kg" });
  });

  it("accepts a unit group ref and gives plain items a null groupRef", async () => {
    expect(await addItem({ name: "Eggs", groupRef: "ביצ|unit|12" })).toMatchObject({ groupRef: "ביצ|unit|12" });
    expect(await addItem({ name: "Salt" })).toMatchObject({ groupRef: null, productCode: null });
  });

  it("400 for both productCode and groupRef, on create and on patch", async () => {
    expect((await call("POST", `/${listId}/items`, { name: "x", category: "y", productCode: "123", groupRef: "בורגול|kg" })).status).toBe(400);
    const item = await addItem({ name: "Rice" });
    expect((await call("PATCH", `/${listId}/items/${item.id}`, { productCode: "123", groupRef: "אורז|kg" })).status).toBe(400);
    expect(row(item.id)).toEqual({ productCode: null, groupRef: null });
  });

  it("400 for a malformed groupRef, on create and on patch", async () => {
    const item = await addItem({ name: "Oil" });
    for (const groupRef of ["x|kg|3", "x|foo", "x", "", "x|unit", "a\"b|kg"]) {
      expect((await call("POST", `/${listId}/items`, { name: "x", category: "y", groupRef })).status, groupRef).toBe(400);
      expect((await call("PATCH", `/${listId}/items/${item.id}`, { groupRef })).status, groupRef).toBe(400);
    }
  });

  it("patching a groupRef clears the productCode, and patching a productCode clears the groupRef", async () => {
    const item = await addItem({ name: "Milk", productCode: milk });
    let res = await call("PATCH", `/${listId}/items/${item.id}`, { groupRef: "חלב|l" });
    expect(await res.json()).toMatchObject({ groupRef: "חלב|l", productCode: "חלב|l" });
    res = await call("PATCH", `/${listId}/items/${item.id}`, { productCode: milk });
    expect(await res.json()).toMatchObject({ groupRef: null, productCode: milk });
    expect(row(item.id)).toEqual({ productCode: milk, groupRef: null });
  });

  it("unmatching with groupRef null clears it and a patch without it leaves it alone", async () => {
    const item = await addItem({ name: "Tahini", groupRef: "טחינה|kg" });
    expect(await (await call("PATCH", `/${listId}/items/${item.id}`, { missing: false })).json()).toMatchObject({ groupRef: "טחינה|kg", missing: false });
    expect(await (await call("PATCH", `/${listId}/items/${item.id}`, { groupRef: null })).json()).toMatchObject({ groupRef: null });
  });

  it("401 signed out", async () => {
    expect((await call("POST", `/${listId}/items`, { name: "x", category: "y", groupRef: "בורגול|kg" }, false)).status).toBe(401);
  });
});

describe("app builds from before Product groups (productCode only)", () => {
  it("stores a group ref sent as productCode as the item's groupRef", async () => {
    const item = await addItem({ name: "Bulgur", productCode: "בורגול|kg" });
    expect(row(item.id)).toEqual({ productCode: null, groupRef: "בורגול|kg" });
    expect(item).toMatchObject({ productCode: "בורגול|kg", groupRef: "בורגול|kg" });
  });

  it("sets the whole match from productCode when a patch has no groupRef", async () => {
    const item = await addItem({ name: "Milk", groupRef: "חלב|l" });
    await call("PATCH", `/${listId}/items/${item.id}`, { name: "Milk", productCode: "חלב|l" });
    expect(row(item.id)).toEqual({ productCode: null, groupRef: "חלב|l" });
    await call("PATCH", `/${listId}/items/${item.id}`, { productCode: milk });
    expect(row(item.id)).toEqual({ productCode: milk, groupRef: null });
    await call("PATCH", `/${listId}/items/${item.id}`, { productCode: "חלב|l" });
    await call("PATCH", `/${listId}/items/${item.id}`, { productCode: null });
    expect(row(item.id)).toEqual({ productCode: null, groupRef: null });
  });
});

describe("startup migration: former Produce-group items move to a group", () => {
  const W = `<bIsWeighted>1</bIsWeighted>`;
  const xml = (items: [string, string, number, boolean, string][]) =>
    `<Root><ChainID>${OSHER}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
      .map(([code, name, price, weighed, unit]) => `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${unit}</UnitQty><Quantity>1</Quantity>${weighed ? W : "<bIsWeighted>0</bIsWeighted>"}<ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
      .join("")}</Items></Root>`;

  it("sets group_ref and clears product_code for weighed and chain-local products; leaves a barcode alone; runs once", async () => {
    ingestStores(deps, "osher-ad", `<Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>x</StoreName><Address>a</Address><City>c</City></Store></Stores></SubChain></SubChains></Root>`);
    ingestPrices(deps, "osher-ad", xml([["111", "בננות", 6, true, "קילוגרם"], [milk, "חלב 3% 1 ליטר", 6, false, "ליטר"], ["112", "אגוזים 100 גרם", 7, false, "גרם"]]));
    const banana = await addItem({ name: "Bananas", productCode: `${OSHER}:111` });
    const barcode = await addItem({ name: "Milk", productCode: milk });
    const chainLocalPacked = await addItem({ name: "Nuts", productCode: `${OSHER}:112` });
    const unknown = await addItem({ name: "Ghost", productCode: "no-such-product" });

    const sqlite = deps.db.$client;
    sqlite.pragma("user_version = 0");
    linkProduceItems(sqlite);

    expect(row(banana.id)).toEqual({ productCode: null, groupRef: "בננה|kg" });
    expect(row(barcode.id)).toEqual({ productCode: milk, groupRef: null });
    expect(row(chainLocalPacked.id)).toEqual({ productCode: null, groupRef: "אגוז|kg" });
    expect(row(unknown.id)).toEqual({ productCode: "no-such-product", groupRef: null });
    expect(sqlite.pragma("user_version", { simple: true })).toBe(1);

    const again = await addItem({ name: "Bananas 2", productCode: `${OSHER}:111` });
    linkProduceItems(sqlite);
    expect(row(again.id)).toEqual({ productCode: `${OSHER}:111`, groupRef: null });
  });

  it("returns the moved item in list detail with its groupRef", async () => {
    const detail = await (await call("GET", `/${listId}`)).json();
    expect(detail.items.find((i: { name: string }) => i.name === "Bananas")).toMatchObject({ groupRef: "בננה|kg", productCode: "בננה|kg" });
  });
});
