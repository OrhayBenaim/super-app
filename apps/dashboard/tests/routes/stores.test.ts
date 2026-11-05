import { describe, expect, it } from "vitest";
import { prices, products, stores } from "api/src/db/appSchema.ts";
import { setup, TOKEN } from "../seam.ts";

const RAMI = "7290058140886";
const SHUFERSAL = "7290027600007";
const store = (chainId: string, storeId: string, name: string, lat: number | null) =>
  ({ id: `${chainId}-${storeId}`, chainId, storeId, subChainId: "1", name, address: "Herzl 1", city: "Haifa", lat, lng: lat === null ? null : 35.2, publishedAddress: "Herzl 1", publishedCity: "Haifa" });

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

  it("filters stores whose Chain now publishes a different address, showing both addresses side by side", async () => {
    const { api, app } = setup();
    api.db
      .insert(stores)
      .values([store(RAMI, "1", "Talpiot", 31.75), { ...store(RAMI, "2", "Afula", null), publishedAddress: "Jaffa 9", publishedCity: "Tel Aviv" }])
      .run();

    expect(await (await app.request("/stores")).text()).not.toContain("Chain publishes");
    const res = await app.request("/stores?publishedDiffers=true");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Afula");
    expect(html).not.toContain("Talpiot");
    expect(html).toContain(`name="publishedDiffers" value="true" checked`);
    expect(html).toMatch(/<td>Herzl 1<\/td>\s*<td>Haifa<\/td>\s*<td>Jaffa 9, Tel Aviv<\/td>/);
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

  it("answers a bad filter with 400 and a notice", async () => {
    const { app } = setup();
    for (const q of ["noLocation=maybe", `chain=${"1".repeat(65)}`, "page=x", "page=0"]) {
      const res = await app.request(`/stores?${q}`);
      expect(res.status, q).toBe(400);
      expect(await res.text(), q).toContain('class="notice');
    }
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

  it("shows the address the Chain publishes next to Grocer's when they differ", async () => {
    const { api, app } = setup();
    api.db.insert(stores).values([store(RAMI, "1", "Talpiot", 31.75), { ...store(RAMI, "2", "Afula", null), publishedAddress: "Jaffa 9" }]).run();

    expect(await (await app.request(`/stores/${RAMI}-1`)).text()).not.toContain("Chain publishes");
    const html = await (await app.request(`/stores/${RAMI}-2`)).text();
    expect(html).toMatch(/<th scope="row">Address<\/th>\s*<td>Herzl 1<\/td>\s*<td>Jaffa 9<\/td>/);
    expect(html).toMatch(/<th scope="row">City<\/th>\s*<td>Haifa<\/td>\s*<td>Haifa<\/td>/);
  });

  it("answers an unknown store, or an id that names none, with 404", async () => {
    const { app } = setup();
    for (const id of ["nope", "1".repeat(65)]) {
      const res = await app.request(`/stores/${id}`);
      expect(res.status, id).toBe(404);
      expect(await res.text()).toContain("No store with this id");
    }
  });
});

describe("Editing a store", () => {
  const ID = `${RAMI}-1`;
  const form = { name: "Talpiot Mall", address: "Ha-Uman 9", city: "Jerusalem", lat: "31.7505", lng: "35.2121" };
  const seeded = () => {
    const s = setup();
    s.api.db.insert(stores).values(store(RAMI, "1", "Talpiot", 31.75)).run();
    return s;
  };
  // A same-origin form post, as the browser sends it.
  const submit = (app: ReturnType<typeof setup>["app"], fields: Record<string, string>, id = ID) =>
    app.request(`/stores/${id}`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  const saved = async (privateApp: ReturnType<typeof setup>["privateApp"]) =>
    ((await (await privateApp.request(`/stores/${ID}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()) as { store: Record<string, unknown> }).store;

  it("shows the store's details in a form on its page", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/stores/${ID}`)).text();
    expect(html).toContain(`action="/stores/${ID}"`);
    expect(html).toContain('name="name" value="Talpiot"');
    expect(html).toContain('name="lat" value="31.75"');
    expect(html).toContain('name="lng" value="35.2"');
  });

  it("saves the edit, which the api then returns, and goes back to the store's page", async () => {
    const { app, privateApp } = seeded();
    const res = await submit(app, form);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/stores/${ID}`);
    expect(await saved(privateApp)).toMatchObject({ name: "Talpiot Mall", address: "Ha-Uman 9", city: "Jerusalem", lat: 31.7505, lng: 35.2121 });
    expect(await (await app.request(`/stores/${ID}`)).text()).toContain("Talpiot Mall");
  });

  it("clears the location when both fields are left empty", async () => {
    const { app, privateApp } = seeded();
    expect((await submit(app, { ...form, lat: "", lng: " " })).status).toBe(303);
    expect(await saved(privateApp)).toMatchObject({ lat: null, lng: null });
  });

  it("refuses a bad edit with the reason, keeps what was typed, and leaves the store as it was", async () => {
    const { app, privateApp } = seeded();
    for (const [fields, reason] of [
      [{ ...form, name: "" }, "The name is required."],
      [{ ...form, lat: "40.7", lng: "-74" }, "The location is outside Israel."],
      [{ ...form, lat: "north" }, "Latitude and longitude must be numbers."],
    ] as const) {
      const res = await submit(app, fields);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain(reason);
      expect(html).toContain('name="address" value="Ha-Uman 9"');
    }
    expect(await saved(privateApp)).toMatchObject({ name: "Talpiot", lat: 31.75 });
  });

  it("answers an unknown store, or an id that names none, with 404", async () => {
    const { app } = seeded();
    expect((await submit(app, form, "nope")).status).toBe(404);
    expect((await submit(app, form, "1".repeat(65))).status).toBe(404);
  });
});
