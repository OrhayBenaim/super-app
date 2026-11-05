// The Product groups pages (A8, A9): the list by Product type, the open group and its edits, and a new Made group.
import { describe, expect, it } from "vitest";
import { prices, products, stores } from "api/src/db/appSchema.ts";
import { refreshBrowse } from "api/src/prices/browse-groups.ts";
import { post, setup, TOKEN } from "../seam.ts";

const OSHER = "7290103152017";
const MILK3 = "7290000000011";
const MILK1 = "7290000000028";
const SHOKO = "7290000000035";
const POWDER = "7290000000042";
const SOY = "7290000000059";
const SOY_LIGHT = "7290000000066";
const TNUVA1 = "7290000000073";
const MILK = "חלב|l";
const enc = encodeURIComponent;

/** Milk by the liter (four, two of them Tnuva), milk powder by the kilo and two soy drinks, all Dairy and eggs, at two Osher Ad stores. */
async function seeded() {
  const ctx = setup();
  const { db } = ctx.api;
  const store = (n: number) => ({ id: `${OSHER}-${n}`, chainId: OSHER, storeId: String(n), subChainId: "1", name: `אושר עד ${n}`, address: "רחוב 1", city: "תל אביב" });
  db.insert(stores).values([store(1), store(2)]).run();
  const product = (code: string, name: string, unitQty: string) => ({ code, name, unitQty, productType: "dairy-eggs" as const });
  db.insert(products)
    .values([
      product(MILK3, "חלב תנובה 3% 1 ליטר", "ליטר"),
      product(MILK1, "חלב טרה 1% 1 ליטר", "ליטר"),
      product(SHOKO, "חלב שוקו 1 ליטר", "ליטר"),
      product(TNUVA1, "חלב תנובה 1% 1 ליטר", "ליטר"),
      product(POWDER, "חלב אבקה 400 גרם", "גרם"),
      product(SOY, "משקה סויה אלפרו 1 ליטר", "ליטר"),
      product(SOY_LIGHT, "משקה סויה ללא סוכר 1 ליטר", "ליטר"),
    ])
    .run();
  const at = (n: number, code: string, price: number) => ({ storeId: `${OSHER}-${n}`, code, price });
  db.insert(prices)
    .values([at(1, MILK3, 6), at(2, MILK3, 5.5), at(1, MILK1, 5), at(1, SHOKO, 4), at(2, TNUVA1, 5.2), at(1, POWDER, 20), at(1, SOY, 9), at(2, SOY, 9.5), at(1, SOY_LIGHT, 8.9)])
    .run();
  await refreshBrowse(db);
  /** A private request with the token: what the api holds after a dashboard edit. */
  const team = (path: string) => ctx.privateApp.request(path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { ...ctx, team };
}

/** A same-origin htmx form post. */
const form = (fields: [string, string][]) => ({
  ...post(),
  headers: { ...post().headers, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

describe("Product groups page (A8)", () => {
  it("lists a Product type's groups most Products first, and opens the first: its facts, the note and its members cheapest per liter first", async () => {
    const { app } = await seeded();
    const res = await app.request("/groups");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('aria-current="page">Product groups');
    expect(html).toContain('href="/groups/new?type=dairy-eggs"');
    for (const text of ["Dairy &amp; eggs", "4 Products · by the liter", "חלב אבקה", "by the kilo", "commonest pack 1 l", "2 stores", "Grocer starts each group from the words"])
      expect(html, text).toContain(text);
    expect(html).toContain("cheapest per liter first");
    // Cheapest per liter first: chocolate milk at 4, then 1% at 5, then 3% at 5.50 (its cheaper store)
    expect(html.indexOf("חלב שוקו 1 ליטר")).toBeLessThan(html.indexOf("חלב טרה 1% 1 ליטר"));
    expect(html.indexOf("חלב טרה 1% 1 ליטר")).toBeLessThan(html.indexOf("חלב תנובה 3% 1 ליטר"));
    expect(html).toContain("₪5.50");
    expect(html).toContain(`href="/products/${MILK3}"`);
    expect(html).toContain(`hx-get="/products/${MILK3}/image"`);
    expect(html).not.toContain("Delete group"); // a word group is not deleted
  });

  it("opens the group a ref names, in its own Product type, and filters the list by name", async () => {
    const { app } = await seeded();
    const html = await (await app.request(`/groups?ref=${enc("חלב אבקה|kg")}`)).text();
    expect(html).toContain("by the kilo · commonest pack 0.4 kg");
    expect(html).toContain('<option value="dairy-eggs" selected');
    const filtered = await (await app.request(`/groups?type=dairy-eggs&q=${enc("סויה")}`)).text();
    expect(filtered).toContain("משקה סויה");
    expect(filtered).not.toContain(new URLSearchParams({ ref: MILK }).toString());
    expect(await (await app.request("/groups?type=drinks")).text()).toContain("No Product groups");
  });

  it("shows narrower groups as links that open them", async () => {
    const { app } = await seeded();
    const html = await (await app.request(`/groups?ref=${enc(MILK)}`)).text();
    expect(html).toContain("Narrower");
    expect(html).toContain(new URLSearchParams({ ref: "חלב תנובה|l" }).toString());
  });

  it("is 404 for a group that is not there, and ignores a type that is not one", async () => {
    const { app } = await seeded();
    expect((await app.request(`/groups?ref=${enc("קקק|l")}`)).status).toBe(404);
    expect((await app.request("/groups?ref=x")).status).toBe(404);
    expect((await app.request("/groups?type=nope")).status).toBe(200);
  });
});

describe("editing a group (A8)", () => {
  it("renames it, and the list tags it Edited", async () => {
    const { app } = await seeded();
    const res = await app.request(`/groups/${enc(MILK)}/name`, form([["name", "חלב טרי"]]));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<h2 lang="he">חלב טרי</h2>');
    const html = await (await app.request(`/groups?ref=${enc(MILK)}`)).text();
    expect(html).toContain("Edited");
    expect(await (await app.request(`/groups/${enc(MILK)}/name`, form([["name", " "]]))).text()).toContain("Give the group a name");
  });

  it("removes a Product, finds it again marking members Added, and adds it back keeping the search open", async () => {
    const { app } = await seeded();
    const removed = await (await app.request(`/groups/${enc(MILK)}/remove`, form([["code", SHOKO]]))).text();
    expect(removed).not.toContain(`href="/products/${SHOKO}"`);
    const found = await (await app.request(`/groups/${enc(MILK)}/find?q=${enc("חלב")}`)).text();
    expect(found).toContain("חלב שוקו 1 ליטר");
    expect(found).toContain("Added"); // the milk still in it
    expect(found).toContain('aria-label="Add חלב שוקו 1 ליטר"');
    const added = await (await app.request(`/groups/${enc(MILK)}/add`, form([["code", SHOKO], ["q", "חלב"]]))).text();
    expect(added).toContain(`href="/products/${SHOKO}"`);
    expect(added).toContain('<details class="add-products" open>');
    expect(added).not.toContain('aria-label="Add חלב שוקו 1 ליטר"'); // Added now
  });

  it("refuses a Product measured another way, and says when the group is gone", async () => {
    const { app } = await seeded();
    expect(await (await app.request(`/groups/${enc(MILK)}/add`, form([["code", POWDER]]))).text()).toContain("measured another way");
    expect(await (await app.request(`/groups/${enc("קקק|l")}/remove`, form([["code", SHOKO]]))).text()).toContain("No such group");
  });
});

describe("a new Made group (A9)", () => {
  it("shows the form beside the list, and finds Products to add, marking those already in it", async () => {
    const { app } = await seeded();
    const page = await (await app.request("/groups/new")).text();
    for (const text of ['name="name"', 'name="productType"', 'name="measure"', "Create group", "Cancel", "Not saved yet", "In this group · 0"]) expect(page, text).toContain(text);
    const soy = JSON.stringify({ code: SOY, name: "משקה סויה אלפרו 1 ליטר", measure: "l", size: 1, storeCount: 2, minPrice: 9 });
    const draft = await (await app.request("/groups/new/draft", form([["q", "סויה"], ["item", soy], ["measure", "l"]]))).text();
    expect(draft).toContain("משקה סויה ללא סוכר 1 ליטר");
    expect(draft).toContain("In this group · 1");
    expect(draft).toContain("Added");
    expect(draft).toContain('id="results" hx-swap-oob="true"');
    expect(draft).toContain("Cheapest per liter: ₪9.00 at 2 stores");
  });

  it("adds and removes Products before the group is saved", async () => {
    const { app } = await seeded();
    const light = JSON.stringify({ code: SOY_LIGHT, name: "משקה סויה ללא סוכר 1 ליטר", measure: "l", size: 1, storeCount: 1, minPrice: 8.9 });
    const added = await (await app.request("/groups/new/draft", form([["add", light], ["measure", "l"]]))).text();
    expect(added).toContain("In this group · 1");
    expect(added).toContain('name="item"');
    const removed = await (await app.request("/groups/new/draft", form([["item", light], ["remove", SOY_LIGHT], ["measure", "l"]]))).text();
    expect(removed).toContain("In this group · 0");
  });

  it("creates it and opens it, tagged Made here, and deletes it", async () => {
    const { app } = await seeded();
    const items: [string, string][] = [SOY, SOY_LIGHT].map((code) => ["item", JSON.stringify({ code })]);
    const res = await app.request("/groups/new", form([["name", "חלב סויה"], ["productType", "dairy-eggs"], ["measure", "l"], ...items]));
    expect(res.status).toBe(303);
    const opened = res.headers.get("location")!;
    const ref = new URLSearchParams(opened.split("?")[1]).get("ref")!;
    expect(ref).toMatch(/^made:\d+$/);
    const html = await (await app.request(opened)).text();
    for (const text of ["Made here", '<h2 lang="he">חלב סויה</h2>', "2 Products", "Delete group"]) expect(html, text).toContain(text);
    const deleted = await app.request(`/groups/${enc(ref)}/delete`, post());
    expect(deleted.headers.get("HX-Redirect")).toBe("/groups?type=dairy-eggs");
    expect((await app.request(opened)).status).toBe(404);
  });

  it("keeps what was typed and says what is wrong: no name, no pack count, a Product measured another way", async () => {
    const { app } = await seeded();
    const noName = await app.request("/groups/new", form([["name", ""], ["productType", "dairy-eggs"], ["measure", "l"]]));
    expect(noName.status).toBe(400);
    expect(await noName.text()).toContain("Give the group a name");
    const noPack = await app.request("/groups/new", form([["name", "ביצים"], ["productType", "dairy-eggs"], ["measure", "unit"], ["size", ""]]));
    expect(await noPack.text()).toContain("A pack count from 1 to 1000");
    const powder = JSON.stringify({ code: POWDER, name: "חלב אבקה 400 גרם", measure: "kg", size: 0.4, storeCount: 1, minPrice: 20 });
    const other = await app.request("/groups/new", form([["name", "חלב סויה"], ["productType", "dairy-eggs"], ["measure", "l"], ["item", powder]]));
    expect(other.status).toBe(400);
    const html = await other.text();
    expect(html).toContain("measured another way");
    expect(html).toContain('value="חלב סויה"');
    expect(html).toContain("חלב אבקה 400 גרם");
  });

  it("makes a unit group of a pack count", async () => {
    const { app, team } = await seeded();
    const res = await app.request("/groups/new", form([["name", "ביצים"], ["productType", "dairy-eggs"], ["measure", "unit"], ["size", "12"]]));
    expect(res.status).toBe(303);
    const ref = new URLSearchParams(res.headers.get("location")!.split("?")[1]).get("ref")!;
    expect(((await (await team(`/groups/${enc(ref)}`)).json()) as { group: { size: number } }).group.size).toBe(12);
  });
});
