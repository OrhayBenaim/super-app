import { describe, expect, it } from "vitest";
import { prices, products, promotions, stores } from "api/src/db/appSchema.ts";
import { setup, TOKEN } from "../seam.ts";

const RAMI = "7290058140886";
const SHUFERSAL = "7290027600007";
const store = (chainId: string, storeId: string, name: string, lat: number | null) =>
  ({ id: `${chainId}-${storeId}`, chainId, storeId, subChainId: "1", name, address: "Herzl 1", city: "Haifa", lat, lng: lat === null ? null : 35.2, publishedAddress: "Herzl 1", publishedCity: "Haifa" });

describe("Stores page", () => {
  it("leads with how many stores there are, and offers each filter as a chip with its count, keeping the Chain", async () => {
    const { api, app } = setup();
    api.db
      .insert(stores)
      .values([
        store(RAMI, "1", "Talpiot", 31.75),
        store(RAMI, "2", "Afula", null),
        { ...store(RAMI, "3", "Moved", 31.7), publishedAddress: "Jaffa 9" },
        store(SHUFERSAL, "1", "Bat Yam", null),
      ])
      .run();

    const all = await (await app.request("/stores")).text();
    expect(all).toContain("<p>4 stores in 2 Chains</p>");
    expect(all).toContain('<a class="chip" href="/stores" aria-current="true">All <span class="count">4</span></a>');

    const res = await app.request(`/stores?chain=${RAMI}&noLocation=true`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<p>3 stores in Rami Levy</p>");
    expect(html).toContain(`<option value="${RAMI}" selected>Rami Levy</option>`);
    expect(html).toContain(`<a class="chip" href="/stores?chain=${RAMI}">All <span class="count">3</span></a>`);
    expect(html).toContain(`<a class="chip" href="/stores?chain=${RAMI}&amp;noLocation=true" aria-current="true">No location <span class="count">1</span></a>`);
    expect(html).toContain(`<a class="chip" href="/stores?chain=${RAMI}&amp;publishedDiffers=true">Address differs <span class="count">1</span></a>`);
    expect(html).toContain('<input type="hidden" name="noLocation" value="true" />'); // a new Chain keeps the chip
    expect(html).toContain("Afula");
    expect(html).not.toContain("Talpiot");
    expect(html).not.toContain("Bat Yam");
  });

  it("lists each store with a link, its Chain, address and city, a city that is a number in amber", async () => {
    const { api, app } = setup();
    api.db.insert(stores).values([store(RAMI, "1", "Talpiot", 31.75), { ...store(RAMI, "2", "Afula", null), address: "", city: "2006" }]).run();

    const html = await (await app.request("/stores")).text();
    expect(html).toMatch(
      new RegExp(`<td><a href="/stores/${RAMI}-1" dir="auto">Talpiot</a></td>\\s*<td>Rami Levy</td>\\s*<td><span dir="auto">Herzl 1</span></td>\\s*<td><span dir="auto">Haifa</span></td>`),
    );
    expect(html).toMatch(/<td><span dir="auto"><span class="muted">—<\/span><\/span><\/td>\s*<td class="warn">2006<\/td>/);
    expect(html).toContain("a city that is a number is a code the Chain published");
  });

  it("maps the filtered stores that have a location, and says how many are not on the map", async () => {
    const { api, app } = setup();
    api.db.insert(stores).values([store(RAMI, "1", "Talpiot", 31.75), store(RAMI, "2", "Afula", null)]).run();

    const html = await (await app.request("/stores")).text();
    expect(html).toContain("/assets/leaflet.js");
    expect(html).toContain("Talpiot&quot;,&quot;lat&quot;:31.75"); // the map's points
    expect(html).not.toContain("Afula&quot;");
    expect(html).toContain("1 placed store");
    expect(html).toContain("1 has no location, so is not on the map");
    expect(await (await app.request("/stores?noLocation=true")).text()).toContain('data-stores="[]"');
  });

  it("pages the table, keeping the filter", async () => {
    const { api, app } = setup();
    api.db
      .insert(stores)
      .values(Array.from({ length: 105 }, (_, i) => store(RAMI, String(i), `Store ${String(i).padStart(3, "0")}`, null)))
      .run();

    const first = await (await app.request("/stores?noLocation=true")).text();
    expect(first).toContain("1–100 of 105");
    expect(first).toContain('href="/stores?noLocation=true&amp;page=2">Next</a>');
    const second = await (await app.request("/stores?noLocation=true&page=2")).text();
    expect(second).toContain("101–105 of 105");
    expect(second).toContain('href="/stores?noLocation=true&amp;page=1">Previous</a>');
    expect(second).not.toContain("Next");
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

  it("says so when no store matches", async () => {
    const { app } = setup();
    expect(await (await app.request("/stores?publishedDiffers=true")).text()).toContain("No stores match.");
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

  it("is linked from every page's navigation, and marks itself current", async () => {
    const { app } = setup();
    expect(await (await app.request("/chains")).text()).toContain('href="/stores"');
    expect(await (await app.request("/stores")).text()).toContain('<a href="/stores" aria-current="page">');
  });
});

describe("Store page", () => {
  const NOW = new Date("2026-11-05T10:00:00Z");

  it("leads with its Chain, store id, prices and when they were last updated, and links to its Promotions", async () => {
    const { api, app } = setup({ now: NOW });
    api.db.insert(stores).values(store(RAMI, "1", "Talpiot", 31.75)).run();
    api.db.insert(products).values([{ code: "111", name: "Milk" }, { code: "222", name: "Bread" }]).run();
    api.db
      .insert(prices)
      .values([
        { storeId: `${RAMI}-1`, code: "111", price: 6.9, updatedAt: new Date("2026-11-03T05:00:00Z") },
        { storeId: `${RAMI}-1`, code: "222", price: 9.9, updatedAt: new Date("2026-11-05T04:12:00Z") },
      ])
      .run();
    const promo = (promotionId: string) =>
      ({ storeId: `${RAMI}-1`, promotionId, description: "2 for 10", kind: "bundle" as const, minQty: 2, amount: 10, audience: "all" as const, startsAt: NOW, endsAt: new Date(NOW.getTime() + 86_400_000) }); // running, as the count is
    api.db.insert(promotions).values([promo("A"), promo("B")]).run();

    const res = await app.request(`/stores/${RAMI}-1`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<a class="breadcrumb" href="/stores">Stores</a>');
    expect(html).toContain("<h1>Talpiot</h1>");
    expect(html).toContain("<p>Rami Levy · store 1 · 2 prices · last updated today 06:12</p>");
    expect(html).toContain(`<a class="button button-tinted" href="/promotions?store=${RAMI}-1">Promotions · 2</a>`);
    expect(html).toContain('<a href="/stores" aria-current="page">');
  });

  it("shows what Grocer has next to what the Chain publishes when they differ, with a button that copies it into the form", async () => {
    const { api, app } = setup();
    api.db.insert(stores).values([store(RAMI, "1", "Talpiot", 31.75), { ...store(RAMI, "2", "Afula", null), publishedAddress: "Jaffa 9", publishedCity: "Tel Aviv" }]).run();

    expect(await (await app.request(`/stores/${RAMI}-1`)).text()).not.toContain("Address differs");
    const html = await (await app.request(`/stores/${RAMI}-2`)).text();
    expect(html).toContain("Rami Levy now publishes a different address for this store");
    expect(html).toMatch(/Grocer has<\/span>\s*<strong dir="auto">Herzl 1<\/strong>\s*<span dir="auto">Haifa<\/span>/);
    expect(html).toMatch(/Rami Levy publishes<\/span>\s*<strong dir="auto">Jaffa 9<\/strong>\s*<span dir="auto">Tel Aviv<\/span>/);
    expect(html).toContain('data-address="Jaffa 9" data-city="Tel Aviv">Copy into the form</button>');
    expect(html).toContain("Fills Address and City below. Nothing changes until you save.");
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

  it("shows the store's details in a form on its page, with its saved location on a map", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/stores/${ID}`)).text();
    expect(html).toContain(`action="/stores/${ID}"`);
    expect(html).toContain('name="name" value="Talpiot"');
    expect(html).toContain('name="lat" value="31.75"');
    expect(html).toContain('name="lng" value="35.2"');
    expect(html).toContain('type="submit" class="button button-filled">Save changes</button>');
    expect(html).toContain(`<a class="button button-plain" href="/stores/${ID}">Cancel</a>`);
    expect(html).toContain("Saved location · drag the pin to move it");
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
    const html = await (await app.request(`/stores/${ID}`)).text();
    expect(html).toContain("No location. The next Price sync places the store from its address.");
    expect(html).not.toContain('id="pin"');
  });

  it("refuses a bad edit with the reason under its field, keeps what was typed, and leaves the store as it was", async () => {
    const { app, privateApp } = seeded();
    for (const [fields, field, reason] of [
      [{ ...form, name: "" }, "name", "The name is required."],
      [{ ...form, lng: "3.47812" }, "lng", "Outside Israel. Longitude runs from 34.2 to 35.95: check the digits."],
      [{ ...form, lat: "north" }, "lat", "Latitude must be a number."],
      [{ ...form, lng: "" }, "lng", "Give both latitude and longitude, or neither."],
    ] as const) {
      const res = await submit(app, fields);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain(`aria-invalid="true" aria-describedby="${field}-error"`);
      expect(html).toContain(`<span class="message" id="${field}-error">${reason}</span>`);
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
