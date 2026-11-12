import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { products as productsTable } from "#/db/schema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const OSHER = "7290103152017";
// Chain-scoped codes (not GTINs): [code, name, unit, weighted]
const products = [
  ["101", "בננה", "קילוגרם", 1],
  ["102", "בננות", "1 ק\"ג", 1],
  ["103", "אבטיח שלם", "יחידות", 1],
  ["104", "אורז פרסי 1 קג", "יחידות", 0],
] as const;
const code = (c: string) => `${OSHER}:${c}`;
const [banana, , melon, rice] = products.map(([c]) => code(c));

let app: ReturnType<typeof createApp>;
let deps: Deps;
const clock = fakeClock(new Date("2026-01-01T10:00:00Z"));
let cookie: string;
let other: string;
let listId: string;

const signUp = async (email: string) => {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password1234", name: "Q" }),
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
};
const call = (method: string, path: string, body?: unknown, as: string | null = cookie) =>
  app.request(`/api/lists${path}`, {
    method,
    headers: { "content-type": "application/json", ...(as ? { cookie: as } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const add = async (body: Record<string, unknown>) => {
  const res = await call("POST", `/${listId}/items`, { id: randomUUID(), name: "x", category: "c", ...body });
  expect(res.status).toBe(200);
  return res.json();
};
const patch = (id: string, body: unknown) => call("PATCH", `/${listId}/items/${id}`, body);
const detailItem = async (id: string) => ((await (await call("GET", `/${listId}`)).json()).items as { id: string }[]).find((i) => i.id === id);

beforeAll(async () => {
  deps = buildDeps(loadConfig(), { clock });
  app = createApp(deps);
  ingestStores(deps, "osher-ad", `<Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>s</StoreName><Address>a</Address><City>c</City></Store></Stores></SubChain></SubChains></Root>`);
  ingestPrices(
    deps,
    "osher-ad",
    `<Root><ChainID>${OSHER}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${products
      .map(([c, name, unit, w]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${name}</ItemName><UnitQty>${unit}</UnitQty><Quantity>1</Quantity><bIsWeighted>${w}</bIsWeighted><ItemPrice>9.9</ItemPrice></Item>`)
      .join("")}</Items></Root>`,
  );
  cookie = await signUp("q@lists.test");
  other = await signUp("q2@lists.test");
  listId = (await (await call("GET", "")).json())[0].id;
});

describe("item quantities", () => {
  it("starts new items at 1, sold by the unit when unmatched", async () => {
    const item = await add({ name: "Salt" });
    expect(item).toMatchObject({ quantity: 1, soldBy: "unit" });
    expect(await detailItem(item.id)).toMatchObject({ quantity: 1, soldBy: "unit" });
  });

  it("derives sold-by from the matched product: weighted kilos are weight, weighted units and the rest are unit", async () => {
    expect(await add({ productCode: banana })).toMatchObject({ quantity: 1, soldBy: "weight" });
    expect(await add({ productCode: melon })).toMatchObject({ soldBy: "unit" });
    expect(await add({ productCode: rice })).toMatchObject({ soldBy: "unit" });
    expect(await add({ productCode: "7290000000000" })).toMatchObject({ soldBy: "unit" }); // no such product
  });

  it("derives sold-by from a Product group: produce by the kilo is weight, a pack group is unit", async () => {
    const produce = await add({ groupRef: "בננה|kg" });
    expect(await detailItem(produce.id)).toMatchObject({ soldBy: "weight" });
    expect(await add({ groupRef: "אורז|kg" })).toMatchObject({ soldBy: "unit" });
  });

  it("reuses a Product group's sold-by for five minutes, then works it out again", async () => {
    const produce = await add({ groupRef: "בננה|kg" });
    const weighed = (w: boolean) => deps.db.update(productsTable).set({ isWeighted: w }).where(eq(productsTable.code, banana)).run();
    weighed(false);
    try {
      expect(await detailItem(produce.id)).toMatchObject({ soldBy: "weight" });
      clock.advance(5 * 60_000 + 1);
      expect(await detailItem(produce.id)).toMatchObject({ soldBy: "unit" });
    } finally {
      weighed(true);
      clock.advance(5 * 60_000 + 1);
    }
  });

  it("creates an item with a quantity, validated against its sold-by", async () => {
    expect(await add({ productCode: banana, quantity: 1.5 })).toMatchObject({ quantity: 1.5 });
    expect((await call("POST", `/${listId}/items`, { id: randomUUID(), name: "x", category: "c", quantity: 1.5 })).status).toBe(400);
    expect((await call("POST", `/${listId}/items`, { id: randomUUID(), name: "x", category: "c", quantity: 0 })).status).toBe(400);
  });

  it("saves a valid quantity: units take whole numbers, weight half kilos", async () => {
    const unit = await add({ productCode: rice });
    expect(await (await patch(unit.id, { quantity: 3 })).json()).toMatchObject({ quantity: 3, soldBy: "unit" });
    expect((await patch(unit.id, { quantity: 1.5 })).status).toBe(400);
    expect((await patch(unit.id, { quantity: 100 })).status).toBe(400);
    expect(await detailItem(unit.id)).toMatchObject({ quantity: 3 });

    const kilos = await add({ productCode: banana });
    expect(await (await patch(kilos.id, { quantity: 1.5 })).json()).toMatchObject({ quantity: 1.5, soldBy: "weight" });
    expect((await patch(kilos.id, { quantity: 1.25 })).status).toBe(400);
    expect(await detailItem(kilos.id)).toMatchObject({ quantity: 1.5 });
  });

  it("keeps the quantity when the item is checked off and added again", async () => {
    const item = await add({ productCode: rice, quantity: 4 });
    await patch(item.id, { missing: false });
    expect(await (await patch(item.id, { missing: true })).json()).toMatchObject({ missing: true, quantity: 4 });
  });

  it("resets the quantity to 1 when re-matching changes sold-by, unless the patch sets a valid one", async () => {
    const item = await add({ productCode: banana, quantity: 2.5 });
    expect(await (await patch(item.id, { productCode: rice })).json()).toMatchObject({ quantity: 1, soldBy: "unit" });
    expect(await (await patch(item.id, { productCode: banana, quantity: 0.5 })).json()).toMatchObject({ quantity: 0.5, soldBy: "weight" });
    expect(await (await patch(item.id, { productCode: null })).json()).toMatchObject({ quantity: 1, soldBy: "unit" });
  });

  it("keeps the quantity when re-matching keeps sold-by, and rejects one that no longer fits", async () => {
    const item = await add({ productCode: rice, quantity: 3 });
    expect(await (await patch(item.id, { productCode: melon })).json()).toMatchObject({ quantity: 3 });
    expect((await patch(item.id, { productCode: banana, quantity: 1.25 })).status).toBe(400);
  });

  it("re-matches an Item from a Product group to a specific Product: the group is dropped, the Quantity starts over when Sold by changes", async () => {
    const bananas = await add({ groupRef: "בננה|kg", quantity: 2.5 });
    expect(await (await patch(bananas.id, { productCode: banana })).json()).toMatchObject({ productCode: banana, groupRef: null, quantity: 2.5, soldBy: "weight" });

    const kilos = await add({ groupRef: "בננה|kg", quantity: 2.5 });
    expect(await (await patch(kilos.id, { productCode: melon })).json()).toMatchObject({ productCode: melon, groupRef: null, quantity: 1, soldBy: "unit" });
    expect(await detailItem(kilos.id)).toMatchObject({ productCode: melon, groupRef: null, quantity: 1, soldBy: "unit" });

    const rices = await add({ groupRef: "אורז|kg", quantity: 3 });
    expect(await (await patch(rices.id, { productCode: rice })).json()).toMatchObject({ productCode: rice, groupRef: null, quantity: 3, soldBy: "unit" });
  });

  it("401 without a session, 404 for a non-member", async () => {
    const item = await add({ name: "Tea" });
    expect((await call("PATCH", `/${listId}/items/${item.id}`, { quantity: 2 }, null)).status).toBe(401);
    expect((await call("PATCH", `/${listId}/items/${item.id}`, { quantity: 2 }, other)).status).toBe(404);
    expect(await detailItem(item.id)).toMatchObject({ quantity: 1 });
  });
});
