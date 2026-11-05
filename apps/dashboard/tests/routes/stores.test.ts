import { describe, expect, it } from "vitest";
import { prices, products, stores } from "api/src/db/appSchema.ts";
import { setup } from "../seam.ts";

const RAMI = "7290058140886";
const SHUFERSAL = "7290027600007";
const store = (chainId: string, storeId: string, name: string, lat: number | null) =>
  ({ id: `${chainId}-${storeId}`, chainId, storeId, subChainId: "1", name, address: "Herzl 1", city: "Haifa", lat, lng: lat === null ? null : 35.2 });

describe("Stores page", () => {
  it("filters a Chain's stores to those with no location, which the table lists and the map leaves out", async () => {
    const { api, app } = setup();
    api.db
      .insert(stores)
      .values([store(RAMI, "1", "Talpiot", 31.75), store(RAMI, "2", "Afula", null), store(SHUFERSAL, "1", "Bat Yam", null)])
      .run();

    const all = await (await app.request(`/stores?chain=${RAMI}`)).text();
    expect(all).toContain("Talpiot");
    expect(all).toContain("Afula");
    expect(all).not.toContain("Bat Yam");
    expect(all).toContain("31.75000, 35.20000");
    expect(all).toContain("/assets/leaflet.js");
    expect(all).toContain("Talpiot&quot;,&quot;lat&quot;:31.75"); // the map's points
    expect(all).toContain(`<option value="${RAMI}" selected>`);

    const res = await app.request(`/stores?chain=${RAMI}&noLocation=true`);
    expect(res.status).toBe(200);
    const unplaced = await res.text();
    expect(unplaced).toContain("Afula");
    expect(unplaced).not.toContain("Talpiot");
    expect(unplaced).not.toContain("Bat Yam");
    expect(unplaced).toContain("No location");
    expect(unplaced).toContain('data-stores="[]"');
    expect(unplaced).toContain(`href="/stores/${RAMI}-2"`);
  });

  it("shows every Chain's stores when the form sends All Chains", async () => {
    const { api, app } = setup();
    api.db.insert(stores).values([store(RAMI, "1", "Talpiot", 31.75), store(SHUFERSAL, "1", "Bat Yam", null)]).run();
    const res = await app.request("/stores?chain=");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Talpiot");
    expect(html).toContain("Bat Yam");
  });

  it("answers a bad filter with 400", async () => {
    const { app } = setup();
    expect((await app.request("/stores?noLocation=maybe")).status).toBe(400);
  });

  it("serves Leaflet", async () => {
    const { app } = setup();
    expect((await app.request("/assets/leaflet.js")).headers.get("content-type")).toContain("javascript");
    expect((await app.request("/assets/leaflet.css")).headers.get("content-type")).toContain("text/css");
  });

  it("is linked from every page's navigation", async () => {
    const { app } = setup();
    expect(await (await app.request("/chains")).text()).toContain('href="/stores"');
  });
});

describe("Store page", () => {
  it("shows the store with its price count and when its prices were last updated", async () => {
    const { api, app } = setup();
    api.db.insert(stores).values(store(RAMI, "1", "Talpiot", 31.75)).run();
    api.db.insert(products).values([{ code: "111", name: "Milk" }, { code: "222", name: "Bread" }]).run();
    api.db
      .insert(prices)
      .values([
        { storeId: `${RAMI}-1`, code: "111", price: 6.9, updatedAt: new Date("2026-11-03T05:00:00Z") },
        { storeId: `${RAMI}-1`, code: "222", price: 9.9, updatedAt: new Date("2026-11-04T05:00:00Z") },
      ])
      .run();

    const res = await app.request(`/stores/${RAMI}-1`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Talpiot");
    expect(html).toContain("Rami Levy");
    expect(html).toContain("Herzl 1");
    expect(html).toContain("<dd>2</dd>");
    expect(html).toContain("4 Nov 2026, 07:00"); // the newest price, in Israel time
  });

  it("answers an unknown store with 404", async () => {
    const { app } = setup();
    expect((await app.request("/stores/nope")).status).toBe(404);
  });
});
