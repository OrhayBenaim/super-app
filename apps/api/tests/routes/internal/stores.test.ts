import { describe, expect, it } from "vitest";
import { prices, products, promotions, stores } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const TOKEN = "test-sync-token";
const RAMI = "7290058140886";
const SHUFERSAL = "7290027600007";
const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }));
const get = (deps: Deps, path: string, auth = `Bearer ${TOKEN}`) =>
  createInternalApp(deps).request(path, { headers: { Authorization: auth } });
const store = (chainId: string, storeId: string, name: string, lat: number | null) =>
  ({ id: `${chainId}-${storeId}`, chainId, storeId, subChainId: "1", name, address: "Herzl 1", city: "Haifa", lat, lng: lat === null ? null : 35, publishedAddress: "Herzl 1", publishedCity: "Haifa" });

type List = { stores: { id: string; name: string }[]; total: number; page: number; pageSize: number; locations: { id: string }[] };

describe("GET /stores (private)", () => {
  it("lists stores by name with their Chain and location, filtered by Chain and by no location", async () => {
    const deps = setup();
    deps.db
      .insert(stores)
      .values([store(RAMI, "1", "Talpiot", 31.75), store(RAMI, "2", "Afula", null), store(SHUFERSAL, "1", "Bat Yam", 32.02)])
      .run();

    const all = (await (await get(deps, "/stores")).json()) as List;
    expect(all.stores.map((s) => s.name)).toEqual(["Afula", "Bat Yam", "Talpiot"]);
    expect(all.total).toBe(3);
    expect(all.locations.map((s) => s.id).sort()).toEqual([`${SHUFERSAL}-1`, `${RAMI}-1`]);

    const res = await get(deps, `/stores?chain=${RAMI}`);
    expect(res.status).toBe(200);
    const rami = (await res.json()) as List;
    expect(rami.stores).toEqual([
      { id: `${RAMI}-2`, chainId: RAMI, chainName: "Rami Levy", storeId: "2", name: "Afula", address: "Herzl 1", city: "Haifa", lat: null, lng: null, publishedAddress: "Herzl 1", publishedCity: "Haifa" },
      { id: `${RAMI}-1`, chainId: RAMI, chainName: "Rami Levy", storeId: "1", name: "Talpiot", address: "Herzl 1", city: "Haifa", lat: 31.75, lng: 35, publishedAddress: "Herzl 1", publishedCity: "Haifa" },
    ]);
    expect(rami.locations).toEqual([{ id: `${RAMI}-1`, name: "Talpiot", lat: 31.75, lng: 35 }]);

    const unplaced = (await (await get(deps, "/stores?noLocation=true")).json()) as List;
    expect(unplaced.stores.map((s) => s.name)).toEqual(["Afula"]);
    expect(unplaced.locations).toEqual([]);
  });

  it("counts the Chain's stores for each filter, whichever filter is on", async () => {
    const deps = setup();
    deps.db
      .insert(stores)
      .values([
        store(RAMI, "1", "Talpiot", 31.75),
        store(RAMI, "2", "Afula", null),
        { ...store(RAMI, "3", "Moved", null), publishedAddress: "Jaffa 9" },
        { ...store(SHUFERSAL, "1", "Bat Yam", null), publishedCity: "Tel Aviv" },
      ])
      .run();

    expect(((await (await get(deps, `/stores?chain=${RAMI}&noLocation=true`)).json()) as { counts: unknown }).counts).toEqual({ all: 3, noLocation: 2, publishedDiffers: 1 });
    expect(((await (await get(deps, "/stores")).json()) as { counts: unknown }).counts).toEqual({ all: 4, noLocation: 3, publishedDiffers: 2 });
  });

  it("filters stores whose Chain now publishes a different address or city, with both addresses", async () => {
    const deps = setup();
    deps.db
      .insert(stores)
      .values([
        store(RAMI, "1", "Same", 31.75),
        { ...store(RAMI, "2", "Moved", 31.75), publishedAddress: "Jaffa 9" },
        { ...store(RAMI, "3", "Other city", 31.75), publishedCity: "Tel Aviv" },
      ])
      .run();

    const res = await get(deps, "/stores?publishedDiffers=true");
    expect(res.status).toBe(200);
    const moved = (await res.json()) as { stores: Record<string, unknown>[] };
    expect(moved.stores.map((s) => s.name)).toEqual(["Moved", "Other city"]);
    expect(moved.stores[0]).toMatchObject({ address: "Herzl 1", city: "Haifa", publishedAddress: "Jaffa 9", publishedCity: "Haifa" });
  });

  it("pages the table, while the map gets every filtered store with a location", async () => {
    const deps = setup();
    deps.db
      .insert(stores)
      .values(Array.from({ length: 105 }, (_, i) => store(RAMI, String(i), `Store ${String(i).padStart(3, "0")}`, 32)))
      .run();

    const second = (await (await get(deps, "/stores?page=2")).json()) as List;
    expect(second).toMatchObject({ total: 105, page: 2, pageSize: 100 });
    expect(second.stores.map((s) => s.name)).toEqual(["Store 100", "Store 101", "Store 102", "Store 103", "Store 104"]);
    expect(second.locations).toHaveLength(105);
  });

  it("400 on a bad filter or page", async () => {
    const deps = setup();
    expect((await get(deps, "/stores?noLocation=maybe")).status).toBe(400);
    expect((await get(deps, "/stores?page=0")).status).toBe(400);
    expect((await get(deps, "/stores?publishedDiffers=maybe")).status).toBe(400);
    expect((await get(deps, "/stores?chain=")).status).toBe(400);
    expect((await get(deps, `/stores?chain=${"1".repeat(65)}`)).status).toBe(400);
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    expect((await createInternalApp(deps).request("/stores")).status).toBe(401);
    expect((await get(deps, "/stores", "Bearer wrong")).status).toBe(401);
  });
});

describe("GET /stores/:id (private)", () => {
  it("returns the store with its price count and when its prices were last updated", async () => {
    const deps = setup();
    deps.db.insert(stores).values([store(RAMI, "1", "Talpiot", 31.75), store(RAMI, "2", "Afula", null)]).run();
    deps.db.insert(products).values([{ code: "111", name: "Milk" }, { code: "222", name: "Bread" }]).run();
    deps.db
      .insert(prices)
      .values([
        { storeId: `${RAMI}-1`, code: "111", price: 6.9, updatedAt: new Date("2026-11-03T05:00:00Z") },
        { storeId: `${RAMI}-1`, code: "222", price: 9.9, updatedAt: new Date("2026-11-04T05:00:00Z") },
        { storeId: `${RAMI}-2`, code: "111", price: 7.9, updatedAt: new Date("2026-11-05T05:00:00Z") },
      ])
      .run();

    const res = await get(deps, `/stores/${RAMI}-1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      store: {
        id: `${RAMI}-1`,
        chainId: RAMI,
        chainName: "Rami Levy",
        storeId: "1",
        name: "Talpiot",
        address: "Herzl 1",
        city: "Haifa",
        lat: 31.75,
        lng: 35,
        publishedAddress: "Herzl 1",
        publishedCity: "Haifa",
        priceCount: 2,
        pricesUpdatedAt: "2026-11-04T05:00:00.000Z",
        promotionCount: 0,
      },
    });
  });

  it("counts the store's running Promotions, as the Promotions page it links to lists them (not today's included)", async () => {
    const now = new Date("2026-11-05T10:00:00Z"); // a Thursday in Israel (day 5)
    const deps = buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }), { clock: fakeClock(now) });
    deps.db.insert(stores).values([store(RAMI, "1", "Talpiot", null), store(RAMI, "2", "Afula", null)]).run();
    const DAY = 86_400_000;
    const promo = (storeId: string, promotionId: string, from: number, to: number, days: string | null = null) => ({
      storeId, promotionId, description: "2 for 10", kind: "bundle" as const, minQty: 2, amount: 10, audience: "all" as const,
      startsAt: new Date(now.getTime() + from * DAY), endsAt: new Date(now.getTime() + to * DAY), days,
    });
    deps.db
      .insert(promotions)
      .values([
        promo(`${RAMI}-1`, "A", -1, 1),
        promo(`${RAMI}-1`, "WEEKEND", -1, 3, "6,7"), // within its dates, not today: listed under running
        promo(`${RAMI}-1`, "LATER", 1, 3),
        promo(`${RAMI}-1`, "ENDED", -3, -1),
        promo(`${RAMI}-2`, "C", -1, 1),
      ])
      .run();
    expect(await (await get(deps, `/stores/${RAMI}-1`)).json()).toMatchObject({ store: { promotionCount: 2 } });
  });

  it("a store with no prices has a count of 0 and no update time", async () => {
    const deps = setup();
    deps.db.insert(stores).values(store(RAMI, "1", "Talpiot", null)).run();
    expect(await (await get(deps, `/stores/${RAMI}-1`)).json()).toMatchObject({ store: { priceCount: 0, pricesUpdatedAt: null } });
  });

  it("404 for an unknown store, 400 for an id longer than 64 characters", async () => {
    expect((await get(setup(), "/stores/nope")).status).toBe(404);
    expect((await get(setup(), `/stores/${"1".repeat(65)}`)).status).toBe(400);
  });

  it("401 without the token", async () => {
    expect((await createInternalApp(setup()).request(`/stores/${RAMI}-1`)).status).toBe(401);
  });
});

describe("PUT /stores/:id (private)", () => {
  const edit = { name: "Talpiot Mall", address: "Ha-Uman 9", city: "Jerusalem", lat: 31.7505, lng: 35.2121 };
  const put = (deps: Deps, id: string, body: unknown, auth = `Bearer ${TOKEN}`) =>
    createInternalApp(deps).request(`/stores/${id}`, {
      method: "PUT",
      headers: { Authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const seeded = () => {
    const deps = setup();
    deps.db.insert(stores).values(store(RAMI, "1", "Talpiot", 31.75)).run();
    return deps;
  };

  it("sets the store's name, address, city and location, trimmed, and keeps what the Chain publishes", async () => {
    const deps = seeded();
    const res = await put(deps, `${RAMI}-1`, { ...edit, name: "  Talpiot Mall " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ store: { id: `${RAMI}-1`, ...edit } });
    expect(await (await get(deps, `/stores/${RAMI}-1`)).json()).toMatchObject({ store: { ...edit, publishedAddress: "Herzl 1", publishedCity: "Haifa" } });
  });

  it("clears the location", async () => {
    const deps = seeded();
    expect((await put(deps, `${RAMI}-1`, { ...edit, lat: null, lng: null })).status).toBe(200);
    expect(await (await get(deps, `/stores/${RAMI}-1`)).json()).toMatchObject({ store: { lat: null, lng: null } });
  });

  it("400 with a clear message and the field it is about, and keeps the store", async () => {
    const deps = seeded();
    const refused = async (body: unknown) => {
      const res = await put(deps, `${RAMI}-1`, body);
      expect(res.status).toBe(400);
      return await res.json();
    };
    expect(await refused({ ...edit, name: "  " })).toEqual({ error: "The name is required.", field: "name" });
    expect(await refused({ ...edit, lng: 3.47812 })).toEqual({ error: "Outside Israel. Longitude runs from 34.2 to 35.95: check the digits.", field: "lng" });
    expect(await refused({ ...edit, lat: 40.7 })).toEqual({ error: "Outside Israel. Latitude runs from 29.4 to 33.4: check the digits.", field: "lat" });
    expect(await refused({ ...edit, lat: 31.75, lng: null })).toEqual({ error: "Give both latitude and longitude, or neither.", field: "lng" });
    expect(await refused({ ...edit, lat: null })).toEqual({ error: "Give both latitude and longitude, or neither.", field: "lat" });
    expect(await refused({ ...edit, lat: "north" })).toEqual({ error: "Latitude and longitude must be numbers.", field: "lat" });
    expect(await refused({ name: "Talpiot" })).toMatchObject({ error: expect.stringMatching(/address/i), field: "address" });
    expect(await (await get(deps, `/stores/${RAMI}-1`)).json()).toMatchObject({ store: { name: "Talpiot", lat: 31.75 } });
  });

  it("404 for an unknown store, 400 for an id longer than 64 characters", async () => {
    expect((await put(seeded(), "nope", edit)).status).toBe(404);
    expect((await put(seeded(), "1".repeat(65), edit)).status).toBe(400);
  });

  it("401 without the token", async () => {
    expect((await put(seeded(), `${RAMI}-1`, edit, "")).status).toBe(401);
  });
});
