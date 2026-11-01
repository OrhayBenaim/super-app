import { beforeAll, describe, expect, it } from "vitest";
import type { app as App } from "../app.js";

let app: typeof App;
let cookie: string;

const here = { lat: 32.0853, lng: 34.7818 };
const KM_PER_DEG = 111.195; // 2*pi*6371/360, matches the server's haversine radius
const north = (km: number, east = 0) => ({ lat: here.lat + km / KM_PER_DEG, lng: here.lng + east / (KM_PER_DEG * Math.cos((here.lat * Math.PI) / 180)) });

const OSHER = "7290103152017";
const RAMI = "7290058140886";
const TIV = "7290873255550";

const storesXml = (chain: string, stores: { id: string; name: string }[]) =>
  `<Root><ChainId>${chain}</ChainId><Stores>${stores
    .map((s) => `<Store><StoreId>${s.id}</StoreId><StoreName>${s.name}</StoreName><Address>addr ${s.id}</Address><City>City</City></Store>`)
    .join("")}</Stores></Root>`;
const pricesXml = (chain: string, store: string, items: [code: string, price: number, name?: string][]) =>
  `<Root><ChainId>${chain}</ChainId><StoreId>${store}</StoreId><Items>${items
    .map(([c, p, n]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n ?? `product ${c}`}</ItemName><ItemPrice>${p}</ItemPrice></Item>`)
    .join("")}</Items></Root>`;

// Store fixtures: [chainKey, chainId, storeId, position, prices]
beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  ({ app } = await import("../app.js"));
  const { db } = await import("../db/index.js");
  const { ingestPrices, ingestStores } = await import("../ingest/ingest.js");
  const setPos = db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE id = ?");

  const osher = [
    { id: "1", name: "sA", at: north(1), prices: [["P1", 50], ["P2", 50]] },
    { id: "2", name: "sB", at: north(2), prices: [["P1", 1]] },
    { id: "3", name: "sC", at: north(3), prices: [["P1", 60], ["P2", 60]] },
    { id: "4", name: "sD", at: north(0.5), prices: [["P1", 60], ["P2", 60]] },
    { id: "5", name: "sZero", at: north(1.5), prices: [["Z1", 5]] }, // in range but carries none of P1/P2
    { id: "6", name: "sF", at: north(4), prices: [["P3", 0.1], ["P4", 0.2]] }, // float sum
    { id: "7", name: "sNoCoords", at: null, prices: [["P1", 0.5], ["P2", 0.5]] },
    { id: "8", name: "sFar", at: north(30), prices: [["Q1", 9]] },
    { id: "9", name: "sEdgeIn", at: north(9.99), prices: [["R1", 3]] },
    { id: "10", name: "sEdgeOut", at: north(10.01), prices: [["R2", 3]] },
    { id: "11", name: "sCorner", at: north(8, 8), prices: [["R3", 3]] }, // inside the 10 km box, 11.3 km away
    { id: "12", name: "sOneIn", at: north(0.99), prices: [["T1", 3]] },
    { id: "13", name: "sOneOut", at: north(1.01), prices: [["T2", 3]] },
    { id: "14", name: "sSouthWest", at: north(-5, -5), prices: [["R4", 4]] },
    { id: "15", name: "sSearchA", at: null, prices: [] }, // search products live here and in 16 (a store's file replaces its prices)
    { id: "16", name: "sSearchB", at: null, prices: [] },
  ] as const;
  ingestStores("osher-ad", storesXml(OSHER, osher.map(({ id, name }) => ({ id, name }))));
  for (const s of osher) {
    ingestPrices("osher-ad", pricesXml(OSHER, s.id, s.prices as unknown as [string, number][]));
    if (s.at) setPos.run(s.at.lat, s.at.lng, `${OSHER}-${s.id}`);
  }
  // A second chain with no order URL.
  ingestStores("tiv-taam", storesXml(TIV, [{ id: "1", name: "sT" }]));
  ingestPrices("tiv-taam", pricesXml(TIV, "1", [["P1", 70], ["P2", 70]]));
  setPos.run(north(2.5).lat, north(2.5).lng, `${TIV}-1`);
  ingestStores("rami-levy", storesXml(RAMI, [{ id: "1", name: "sR" }]));
  ingestPrices("rami-levy", pricesXml(RAMI, "1", [["P1", 55], ["P2", 55]]));
  setPos.run(north(3.5).lat, north(3.5).lng, `${RAMI}-1`);

  // Products for search.
  ingestPrices(
    "osher-ad",
    pricesXml(OSHER, "15", [
      ["S1", 6, "חלב תנובה 3%"],
      ["S2", 7, "חלב שקד"],
      ["S3", 8, "COLA ZERO 330ml"],
      ["S4", 9, "Coca-Cola Zero"],
      ["S5", 1, "AND OR NOT"],
      ["S6", 2, "NEAR the end"],
      ["S7", 3, "100% juice"],
      ["S8", 4, "snack_bar"],
      ["S9", 5, 'say "hello" (world) *'],
      ["7290000012345", 5, "שוקולד פרה"],
    ]),
  );
  ingestPrices("osher-ad", pricesXml(OSHER, "16", [["S1", 5, "חלב תנובה 3%"]]));
  db.$client.prepare("INSERT INTO products (code, name) VALUES ('NOPRICE', 'חלב ללא מחיר')").run(); // never priced

  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dana@pricesedge.test", password: "password1234", name: "Dana" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

const post = (body: unknown, opts: { auth?: boolean; raw?: string; at?: typeof here } = {}) =>
  app.request("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.auth === false ? {} : { cookie }) },
    body: opts.raw ?? JSON.stringify(body),
  });
const compare = async (body: Record<string, unknown>) => {
  const res = await post({ ...here, ...body });
  expect(res.status).toBe(200);
  return (await res.json()) as { stores: any[]; unmatched: string[] };
};
const names = (r: { stores: any[] }) => r.stores.map((s) => s.storeName);
const search = async (q: string, extra = "") => app.request(`/api/products/search?q=${encodeURIComponent(q)}${extra}`);
const searchCodes = async (q: string) => {
  const res = await search(q);
  expect(res.status, `q=${q}`).toBe(200);
  return ((await res.json()) as { code: string }[]).map((r) => r.code).sort();
};

describe("compare validation", () => {
  it("401 without a cookie, even for an otherwise valid body", async () => {
    expect((await post({ ...here, codes: ["P1"] }, { auth: false })).status).toBe(401);
  });

  it.each([
    ["lat above 90", { lat: 90.0001 }],
    ["lat below -90", { lat: -91 }],
    ["lng above 180", { lng: 180.5 }],
    ["lng below -180", { lng: -181 }],
    ["lat as string", { lat: "32.08" }],
    ["lat null", { lat: null }],
    ["radius 0", { radiusKm: 0 }],
    ["radius negative", { radiusKm: -5 }],
    ["radius 51", { radiusKm: 51 }],
    ["radius string", { radiusKm: "10" }],
    ["unknown sort", { sort: "cheapest" }],
    ["sort uppercase", { sort: "PRICE" }],
    ["limit 0", { limit: 0 }],
    ["limit 101", { limit: 101 }],
    ["limit fractional", { limit: 1.5 }],
    ["codes empty", { codes: [] }],
    ["codes not an array", { codes: "P1" }],
    ["codes with number", { codes: [123] }],
    ["codes with empty string", { codes: [""] }],
    ["codes with blank string", { codes: ["   "] }],
    ["code of 65 chars", { codes: ["9".repeat(65)] }],
    ["201 codes", { codes: Array.from({ length: 201 }, (_, i) => `C${i}`) }],
  ])("400: %s", async (_label, patch) => {
    const res = await post({ ...here, codes: ["P1"], ...patch });
    expect(res.status).toBe(400);
    expect(typeof ((await res.json()) as { error: string }).error).toBe("string");
  });

  it("400 for malformed, empty, null and array bodies; missing lat/lng/codes", async () => {
    for (const raw of ["{nope", "", "null", "[]", "42"]) expect((await post(null, { raw })).status, raw).toBe(400);
    expect((await post({ lng: 34, codes: ["P1"] })).status).toBe(400);
    expect((await post({ lat: 32, codes: ["P1"] })).status).toBe(400);
    expect((await post({ lat: 32, lng: 34 })).status).toBe(400);
  });

  it("accepts the boundary values: 200 codes, radius 1 and 50, limit 1 and 100, lat/lng extremes", async () => {
    const two = Array.from({ length: 200 }, (_, i) => `NOPE${i}`);
    expect((await post({ ...here, codes: two })).status).toBe(200);
    for (const radiusKm of [1, 50]) expect((await post({ ...here, codes: ["P1"], radiusKm })).status).toBe(200);
    for (const limit of [1, 100]) expect((await post({ ...here, codes: ["P1"], limit })).status).toBe(200);
    for (const pos of [{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }, { lat: 0, lng: 0 }])
      expect((await post({ ...pos, codes: ["P1"] })).status, JSON.stringify(pos)).toBe(200);
  });

  it("ignores unknown body keys", async () => {
    expect((await post({ ...here, codes: ["P1"], extra: true })).status).toBe(200);
  });
});

describe("compare semantics", () => {
  it("price: fewest missing first, then lowest total, then nearest", async () => {
    const r = await compare({ codes: ["P1", "P2"] });
    // sA 100 (1km), sR 110 (3.5km), sD 120 (0.5km), sC 120 (3km), sT 140, then sB (1 missing, total 1)
    expect(names(r)).toEqual(["sA", "sR", "sD", "sC", "sT", "sB"]);
    expect(r.stores.map((s) => s.total)).toEqual([100, 110, 120, 120, 140, 1]);
    expect(r.stores.map((s) => s.missingCodes.length)).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("price ties on missing and total fall back to distance (sD before sC)", async () => {
    const r = await compare({ codes: ["P1", "P2"] });
    expect(names(r).indexOf("sD")).toBeLessThan(names(r).indexOf("sC"));
  });

  it("coverage: most matched first, then lowest total", async () => {
    const r = await compare({ codes: ["P1", "P2"], sort: "coverage" });
    expect(names(r)).toEqual(["sA", "sR", "sD", "sC", "sT", "sB"]);
    expect(r.stores.map((s) => s.matched)).toEqual([2, 2, 2, 2, 2, 1]);
  });

  it("distance: nearest first regardless of price or coverage", async () => {
    const r = await compare({ codes: ["P1", "P2"], sort: "distance" });
    expect(names(r)).toEqual(["sD", "sA", "sB", "sT", "sC", "sR"]);
    const d = r.stores.map((s) => s.distanceKm);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });

  it("defaults: sort=price, radius 10, limit 20", async () => {
    const withDefaults = await compare({ codes: ["P1", "P2"] });
    const explicit = await compare({ codes: ["P1", "P2"], sort: "price", radiusKm: 10, limit: 20 });
    expect(withDefaults).toEqual(explicit);
  });

  it("excludes a store in range that carries none of the codes, and a store without coordinates", async () => {
    const r = await compare({ codes: ["P1", "P2"], radiusKm: 50 });
    expect(names(r)).not.toContain("sZero");
    expect(names(r)).not.toContain("sNoCoords");
    expect((await compare({ codes: ["Z1"] })).stores.map((s) => s.storeName)).toEqual(["sZero"]);
  });

  it("limit slices after sorting, and does not change unmatched", async () => {
    const all = await compare({ codes: ["P1", "P2", "P3", "NOPE"] });
    const limited = await compare({ codes: ["P1", "P2", "P3", "NOPE"], limit: 2 });
    expect(limited.stores).toEqual(all.stores.slice(0, 2));
    expect(limited.unmatched).toEqual(["NOPE"]); // P3 is carried by sF, which the limit cut off
    expect(all.unmatched).toEqual(["NOPE"]);
  });

  it("totals are rounded to cents (0.1 + 0.2)", async () => {
    const r = await compare({ codes: ["P3", "P4"] });
    expect(r.stores).toHaveLength(1);
    expect(r.stores[0]).toMatchObject({ storeName: "sF", total: 0.3, matched: 2 });
  });

  it("deduplicates and trims codes; missingCodes keeps request order", async () => {
    const r = await compare({ codes: [" P1 ", "P1", "P2", "NOPE2", "NOPE1", "NOPE2"] });
    expect(r.stores[0]).toMatchObject({ storeName: "sA", matched: 2, total: 100, missingCodes: ["NOPE2", "NOPE1"] });
    expect(r.unmatched).toEqual(["NOPE2", "NOPE1"]);
    expect(r.stores[0].items.map((i: any) => i.code).sort()).toEqual(["P1", "P2"]);
  });

  it("unmatched is empty when every code is carried, and lists everything when nothing is", async () => {
    expect((await compare({ codes: ["P1", "P2"] })).unmatched).toEqual([]);
    const none = await compare({ codes: ["X1", "X2"] });
    expect(none).toEqual({ stores: [], unmatched: ["X1", "X2"] });
  });

  it("a code only carried outside the radius is unmatched, and matched once the radius grows", async () => {
    const small = await compare({ codes: ["Q1"] });
    expect(small).toEqual({ stores: [], unmatched: ["Q1"] });
    const big = await compare({ codes: ["Q1"], radiusKm: 50 });
    expect(big.unmatched).toEqual([]);
    expect(big.stores[0]).toMatchObject({ storeName: "sFar", total: 9 });
    expect(big.stores[0].distanceKm).toBeCloseTo(30, 1);
  });

  it("radius edge: 9.99 km is inside a 10 km radius, 10.01 km is outside", async () => {
    expect(names(await compare({ codes: ["R1"] }))).toEqual(["sEdgeIn"]);
    expect(names(await compare({ codes: ["R2"] }))).toEqual([]);
    expect(names(await compare({ codes: ["R2"], radiusKm: 11 }))).toEqual(["sEdgeOut"]);
  });

  it("radius edge at the minimum (1 km)", async () => {
    expect(names(await compare({ codes: ["T1"], radiusKm: 1 }))).toEqual(["sOneIn"]);
    expect(names(await compare({ codes: ["T2"], radiusKm: 1 }))).toEqual([]);
  });

  it("a store inside the bounding box but outside the circle is excluded", async () => {
    expect(names(await compare({ codes: ["R3"] }))).toEqual([]);
    expect(names(await compare({ codes: ["R3"], radiusKm: 12 }))).toEqual(["sCorner"]);
  });

  it("finds stores south-west of the origin too", async () => {
    const r = await compare({ codes: ["R4"] });
    expect(names(r)).toEqual(["sSouthWest"]);
    expect(r.stores[0].distanceKm).toBeCloseTo(7.07, 1);
  });

  it("returns the full StoreResult shape, and orderUrl is null for a chain without one", async () => {
    const r = await compare({ codes: ["P1", "P2"] });
    const a = r.stores.find((s) => s.storeName === "sA");
    expect(a).toEqual({
      storeId: `${OSHER}-1`,
      chainId: OSHER,
      chainName: "Osher Ad",
      storeName: "sA",
      address: "addr 1",
      city: "City",
      lat: expect.any(Number),
      lng: expect.any(Number),
      distanceKm: 1,
      total: 100,
      matched: 2,
      missingCodes: [],
      items: expect.arrayContaining([{ code: "P1", price: 50 }, { code: "P2", price: 50 }]),
      orderUrl: "https://osherad.co.il/",
    });
    expect(r.stores.find((s) => s.storeName === "sT")).toMatchObject({ chainName: "Tiv Taam", orderUrl: null });
    expect(r.stores.find((s) => s.storeName === "sR")).toMatchObject({ chainName: "Rami Levy" });
  });
});

describe("products search", () => {
  it("matches a Hebrew prefix and several Hebrew prefix tokens (AND)", async () => {
    expect(await searchCodes("חל")).toEqual(["S1", "S2"]);
    expect(await searchCodes("חלב תנ")).toEqual(["S1"]);
    expect(await searchCodes("תנובה חלב")).toEqual(["S1"]); // token order does not matter
    expect(await searchCodes("חלב  שקד")).toEqual(["S2"]); // repeated whitespace
  });

  it("is case-insensitive for Latin text", async () => {
    expect(await searchCodes("cola")).toEqual(["S3", "S4"]); // unicode61 splits "Coca-Cola" into coca + cola
    expect(await searchCodes("COLA 330")).toEqual(["S3"]);
  });

  it("only returns products that have a price", async () => {
    expect(await searchCodes("חלב")).not.toContain("NOPRICE");
  });

  it("reports storeCount and the minimum price", async () => {
    const rows = (await (await search("חלב תנובה")).json()) as any[];
    expect(rows).toEqual([{ code: "S1", name: "חלב תנובה 3%", manufacturer: null, unitQty: null, storeCount: 2, minPrice: 5 }]);
  });

  it("FTS-special characters fall back to LIKE without a 500", async () => {
    for (const q of ['"', '"hello"', "*", "(", ")", "(world)", "-", "--", "a-b", ":", "name:חלב", "^", "'", "\\", "%", "_", "a OR", "~", "{", "}", "[", "]", "NEAR(", "\u0000x"]) {
      const res = await search(q);
      expect(res.status, `q=${JSON.stringify(q)}`).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    }
  });

  it("FTS boolean keywords typed as plain words do not break the search", async () => {
    for (const q of ["AND", "OR", "NOT", "NEAR", "and", "AND OR NOT", "NEAR the", "חלב AND", "OR חלב"]) {
      const res = await search(q);
      expect(res.status, `q=${q}`).toBe(200);
    }
    expect(await searchCodes("AND OR NOT")).toEqual(["S5"]);
    expect(await searchCodes("NEAR the")).toEqual(["S6"]);
  });

  it("LIKE fallback matches the special character literally", async () => {
    expect(await searchCodes("100%")).toEqual(["S7"]);
    expect(await searchCodes("snack_bar")).toEqual(["S8"]);
    expect(await searchCodes("Coca-Cola")).toEqual(["S4"]);
    expect(await searchCodes('"hello"')).toEqual(["S9"]);
  });

  it("LIKE wildcards are escaped: % and _ do not match everything", async () => {
    expect(await searchCodes("%")).toEqual(["S1", "S7"]); // only names containing a literal %
    expect(await searchCodes("snack_bar")).toEqual(["S8"]);
    expect(await searchCodes("snackxbar")).toEqual([]);
    expect(await searchCodes("s_ack-")).toEqual([]);
  });

  it("is consistent on empty input: missing, empty, blank and overlong q are all 400", async () => {
    for (const url of ["/api/products/search", "/api/products/search?q=", "/api/products/search?q=%20%20%20"]) {
      const res = await app.request(url);
      expect(res.status, url).toBe(400);
      expect(typeof ((await res.json()) as { error: string }).error).toBe("string");
    }
    expect((await search("a".repeat(101))).status).toBe(400);
    expect((await search("a".repeat(100))).status).toBe(200);
  });

  it("validates and applies limit", async () => {
    expect((await search("חל", "&limit=1").then((r) => r.json())) as unknown[]).toHaveLength(1);
    for (const l of ["0", "-1", "51", "abc", "1.5", ""]) expect((await search("חל", `&limit=${l}`)).status, `limit=${l}`).toBe(400);
    expect((await search("חל", "&limit=50")).status).toBe(200);
  });

  it("finds a product by barcode: exact, by code prefix (8+ digits), not for short digit strings", async () => {
    expect(await searchCodes("7290000012345")).toEqual(["7290000012345"]);
    expect(await searchCodes("72900000123")).toEqual(["7290000012345"]);
    expect(await searchCodes("7290000099999")).toEqual([]);
    expect(await searchCodes("7290000")).toEqual([]); // < 8 digits keeps the text path
    const rows = (await (await search("7290000012345")).json()) as any[];
    expect(rows[0]).toMatchObject({ name: "שוקולד פרה", storeCount: 1, minPrice: 5 });
  });

  it("GET /chains is public and lists every seeded chain", async () => {
    const res = await app.request("/api/chains");
    expect(res.status).toBe(200);
    const chains = (await res.json()) as { id: string; name: string; nameHe: string; orderUrl: string | null }[];
    expect(chains.length).toBeGreaterThanOrEqual(12);
    expect(chains.map((c) => c.name)).toEqual([...chains.map((c) => c.name)].sort());
    expect(chains.find((c) => c.id === TIV)).toEqual({ id: TIV, name: "Tiv Taam", nameHe: "טיב טעם", orderUrl: null });
  });
});
