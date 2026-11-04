import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";
import { ingestPrices, ingestStores, readXml } from "#/ingest/ingest.ts";

let app: ReturnType<typeof createApp>;
let deps: ReturnType<typeof buildDeps>;
let cookie: string;
// The fixture codes fail the GS1 check digit, so ingest scopes them to Osher Ad.
const [A, B, C, D, E] = ["7290000000001", "7290000000002", "7290000000003", "7290000000004", "7290000000099"].map((c) => `7290103152017:${c}`);
const here = { lat: 32.0853, lng: 34.7818 };

beforeAll(async () => {
  deps = buildDeps(loadConfig());
  app = createApp(deps);
  const fx = (f: string) => readXml(fileURLToPath(new URL(`../__fixtures__/${f}`, import.meta.url)));
  ingestStores(deps, "osher-ad", fx("Stores7290103152017-000-20261021-080500.xml"));
  ingestPrices(deps, "osher-ad", fx("PriceFull7290103152017-001-001-20261021-051600.gz"));
  ingestPrices(deps, "osher-ad", fx("PriceFull7290103152017-001-002-20261021-051600.xml"));
  ingestPrices(deps, "osher-ad", fx("PriceFull7290103152017-001-003-variants.xml"));
  const setPos = deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");
  setPos.run(here.lat + 0.009, here.lng, "7290103152017-1"); // ~1 km
  setPos.run(here.lat + 0.0045, here.lng, "7290103152017-2"); // ~0.5 km
  setPos.run(here.lat + 0.08, here.lng + 0.09, "7290103152017-3"); // inside the 10 km box, ~12 km away

  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dana@prices.test", password: "password1234", name: "Dana" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

const get = (path: string, auth = true) => app.request(path, auth ? { headers: { cookie } } : {});
/** Compare body items, each at quantity 1. */
const q = (codes: unknown) => (Array.isArray(codes) ? codes.map((code) => ({ code, quantity: 1 })) : codes);
const compare = (body: unknown, auth = true) =>
  app.request("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const ids = (r: { stores: { storeId: string }[] }) => r.stores.map((s) => s.storeId.split("-")[1]);

describe("prices", () => {
  it("finds chain-scoped codes by name (storeCount within the chain), never through the barcode prefix", async () => {
    const q = async (text: string) => (await (await get(`/api/products/search?q=${encodeURIComponent(text)}`)).json()) as { code: string; storeCount: number }[];
    const milk = (await q("חלב תנובה")).find((p) => p.code === A);
    expect(milk?.storeCount).toBe(3); // Osher Ad stores 1-3 in the fixtures, no other chain can share a scoped code
    expect(await q("7290103152017")).toEqual([]); // the ChainId prefix of every scoped code is not a barcode match
  });

  it("searches by Hebrew prefix with storeCount and minPrice", async () => {
    const res = await get(`/api/products/search?q=${encodeURIComponent("חל תנו")}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { kind: "product", code: A, name: "חלב תנובה 3%", manufacturer: "תנובה", unitQty: "1 ליטר", storeCount: 3, minPrice: 4, measure: "l", size: 1, soldBy: "unit" },
    ]);
  });

  it("searches the number in a name through FTS and validates the query", async () => {
    const rows = await (await get(`/api/products/search?q=${encodeURIComponent("3%")}`)).json();
    expect(rows.map((r: { code: string }) => r.code)).toEqual([A]);
    expect((await get("/api/products/search?q=")).status).toBe(400);
  });

  it("401 on search and chains without a cookie", async () => {
    expect((await get(`/api/products/search?q=${encodeURIComponent("חלב")}`, false)).status).toBe(401);
    expect((await get("/api/chains", false)).status).toBe(401);
  });

  it("lists chains", async () => {
    const chains = await (await get("/api/chains")).json();
    expect(chains).toContainEqual({ id: "7290103152017", name: "Osher Ad", nameHe: "אושר עד", orderUrl: null }); // no online shop
  });

  it("401 without a session, 400 on a bad body", async () => {
    expect((await compare({ ...here, items: q([A]) }, false)).status).toBe(401);
    expect((await compare({ ...here, items: q([]) })).status).toBe(400);
    expect((await compare({ lat: 91, lng: 0, items: q([A]) })).status).toBe(400);
    expect((await compare({ ...here, items: q([A]), radiusKm: 51 })).status).toBe(400);
  });

  it("compares by price, excluding the out-of-radius store", async () => {
    const r = await (await compare({ ...here, items: q([A, B, C, D, E]) })).json();
    expect(ids(r)).toEqual(["1", "2"]);
    expect(r.stores[0]).toMatchObject({
      chainName: "Osher Ad",
      storeName: "אשדוד",
      total: 25,
      matched: 3,
      missingCodes: [D, E],
      orderUrl: null,
      fillsCart: false,
    });
    expect(r.stores[0].distanceKm).toBeCloseTo(1, 1);
    expect(r.stores[1]).toMatchObject({ total: 16.5, matched: 2, missingCodes: [B, D, E] });
    expect(r.unmatched).toEqual([D, E]);
  });

  it("sorts by distance and by coverage, and honours limit and radius", async () => {
    expect(ids(await (await compare({ ...here, items: q([A, B, C]), sort: "distance" })).json())).toEqual(["2", "1"]);
    expect(ids(await (await compare({ ...here, items: q([A, B, C]), sort: "coverage", limit: 1 })).json())).toEqual(["1"]);
    // Among equal coverage the cheaper store wins.
    expect(ids(await (await compare({ ...here, items: q([A, C]), sort: "coverage" })).json())).toEqual(["2", "1"]);
    expect(ids(await (await compare({ ...here, items: q([A]), radiusKm: 15, sort: "price" })).json())).toEqual(["3", "2", "1"]);
  });
});
