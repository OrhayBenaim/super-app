import { describe, expect, it } from "vitest";
import { prices, products, promotionItems, promotions, stores } from "api/src/db/appSchema.ts";
import { refreshBrowse } from "api/src/prices/browse-groups.ts";
import { fakeClock } from "api/src/utils/clock.ts";
import { post, setup } from "../seam.ts";

const NOW = new Date("2026-11-05T10:00:00Z");
const DAY = 86_400_000;
const RAMI = "7290058140886";
const OSHER = "7290103152017";
const MILK = "7290000066318";
const LOCAL = `${OSHER}:111`;
const IMAGE = "https://img.example/milk.jpg";

/** Milk at a Rami Levy and an Osher Ad store, a Promotion running on it at Rami Levy, and a Chain-only banana. */
function seeded() {
  const looked: string[] = [];
  const productImage = async (code: string) => (looked.push(code), code === MILK ? IMAGE : null);
  const ctx = setup({ now: NOW, productImage });
  const { db } = ctx.api;
  const store = (chainId: string, name: string) => ({ id: `${chainId}-1`, chainId, storeId: "1", subChainId: "1", name, address: "רחוב 1", city: "ירושלים" });
  db.insert(stores).values([store(RAMI, "רמי לוי תלפיות"), store(OSHER, "אושר עד גבעת שאול")]).run();
  db.insert(products)
    .values([
      { code: MILK, name: "חלב 3% 1 ליטר", manufacturer: "תנובה", unitQty: "ליטר", productType: "dairy-eggs" },
      { code: LOCAL, name: "בננות", unitQty: "קילוגרם", isWeighted: true },
    ])
    .run();
  db.insert(prices)
    .values([
      { storeId: `${OSHER}-1`, code: MILK, price: 6.9, updatedAt: NOW },
      { storeId: `${RAMI}-1`, code: MILK, price: 5.9, updatedAt: NOW },
      { storeId: `${OSHER}-1`, code: LOCAL, price: 9.9, updatedAt: NOW },
    ])
    .run();
  const [promo] = db
    .insert(promotions)
    .values({
      storeId: `${RAMI}-1`, promotionId: "P1", description: "2 ב-10 למועדון", kind: "bundle", minQty: 2, amount: 10, audience: "club",
      startsAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + DAY),
    })
    .returning({ id: promotions.id })
    .all();
  db.insert(promotionItems).values({ promotionId: promo!.id, code: MILK }).run();
  return { ...ctx, looked };
}

describe("Products page", () => {
  it("lists the Product types with their counts, All Products first and No type yet last, and every priced Product", async () => {
    const { app } = seeded();
    const res = await app.request("/products");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("2 Products · 1 has no type yet");
    const types = html.slice(html.indexOf('aria-label="Product types"'));
    expect(types).toMatch(/<a href="\/products" aria-current="page">All Products <span class="count">2<\/span><\/a>/);
    expect(types).toContain('<a href="/products?type=dairy-eggs">Dairy &amp; eggs <span class="count">1</span></a>');
    expect(types).toContain('<a href="/products?type=none">No type yet <span class="count warn">1</span></a>');
    expect(types.indexOf("All Products")).toBeLessThan(types.indexOf("Dairy &amp; eggs"));
    expect(types.indexOf("Other")).toBeLessThan(types.indexOf("No type yet"));
    // Most stores first: the milk two stores price, then the banana one does
    expect(html.indexOf("חלב 3% 1 ליטר")).toBeLessThan(html.indexOf("בננות"));
    expect(html).toContain("1–2 of 2");
  });

  it("shows the chosen type's Products as cards: name, size, from price and store count, each linking to its page", async () => {
    const { app } = seeded();
    const html = await (await app.request("/products?type=dairy-eggs")).text();
    expect(html).toContain('<a href="/products?type=dairy-eggs" aria-current="page">');
    expect(html).toContain("<h2>Dairy &amp; eggs</h2>");
    expect(html).toContain("1 Product · most widely sold first");
    expect(html).toContain('placeholder="Filter Dairy &amp; eggs"');
    const card = html.slice(html.indexOf(`<a class="card" href="/products/${MILK}"`));
    for (const text of ["חלב 3% 1 ליטר", "1 l", "from ₪5.90", "2 stores"]) expect(card).toContain(text);
    expect(html).not.toContain("בננות");
    expect(html).not.toContain('rel="next"');
  });

  it("loads each card's image when it scrolls into view", async () => {
    const { app, looked } = seeded();
    const html = await (await app.request("/products")).text();
    expect(looked).toEqual([]);
    expect(html).toContain(`hx-get="/products/${MILK}/image" hx-trigger="intersect once"`);
  });

  it("narrows the chosen type by name or barcode with the filter field", async () => {
    const { app } = seeded();
    const milk = encodeURIComponent("חלב");
    const dairy = await (await app.request(`/products?q=${milk}&type=dairy-eggs`)).text();
    expect(dairy).toContain("חלב 3% 1 ליטר");
    expect(dairy).toContain('<input type="hidden" name="type" value="dairy-eggs" />');
    expect(await (await app.request(`/products?q=${milk}&type=frozen`)).text()).toContain("No Products match");
    expect(await (await app.request(`/products?q=${MILK}&type=dairy-eggs`)).text()).toContain("חלב 3% 1 ליטר");
  });

  it("searches every Product from the top bar's find field", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/products?q=${encodeURIComponent("בננ")}`)).text();
    expect(html).toContain('<a href="/products" aria-current="page">All Products');
    expect(html).toContain("בננות");
    expect(html).not.toContain("חלב 3% 1 ליטר");
  });

  it("lists the Products with no Product type yet", async () => {
    const { app } = seeded();
    const html = await (await app.request("/products?type=none")).text();
    expect(html).toContain("בננות");
    expect(html).not.toContain("חלב 3% 1 ליטר");
  });

  it("says when nothing matches, and when the filter is too short or too long", async () => {
    const { app } = seeded();
    expect(await (await app.request("/products?q=zzzz")).text()).toContain("No Products match");
    const short = await app.request("/products?q=a");
    expect(short.status).toBe(200);
    expect(await short.text()).toContain("at least 2 characters");
    const long = await app.request(`/products?q=${"a".repeat(101)}`);
    expect(long.status).toBe(400);
    expect(await long.text()).toContain("at most");
  });
});

describe("Changing a Product's type", () => {
  const change = (app: ReturnType<typeof seeded>["app"], code: string, productType: string) => {
    const init = post();
    return app.request(`/products/${encodeURIComponent(code)}/type`, {
      ...init,
      headers: { ...init.headers, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ productType }).toString(),
    });
  };
  const typeOf = async (privateApp: ReturnType<typeof seeded>["privateApp"], code: string) =>
    ((await (await privateApp.request(`/products/${encodeURIComponent(code)}`, { headers: { Authorization: "Bearer test-sync-token" } })).json()) as { product: { productType: string | null } })
      .product.productType;

  it("offers every Product type on the Product's page, its own chosen", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/products/${MILK}`)).text();
    expect(html).toContain(`hx-post="/products/${MILK}/type"`);
    expect(html).toContain('<option value="dairy-eggs" selected>');
    expect(html).toContain('<option value="other">');
  });

  it("saves the chosen type, which the api then returns", async () => {
    const { app, privateApp } = seeded();
    const res = await change(app, LOCAL, "produce");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<option value="produce" selected>');
    expect(html).toContain("Saved");
    expect(await typeOf(privateApp, LOCAL)).toBe("produce");
  });

  // htmx swaps only a 2xx, so a refusal is a 200 fragment, as the Manual sync button's.
  it("refuses a type outside the fixed list and keeps the old one", async () => {
    const { app, privateApp } = seeded();
    const res = await change(app, MILK, "soup");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Choose one of the Product types");
    expect(await typeOf(privateApp, MILK)).toBe("dairy-eggs");
  });

  it("says when there is no such Product", async () => {
    const { app } = seeded();
    for (const code of ["123", "1".repeat(65)]) {
      const res = await change(app, code, "produce");
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("No Product with this code");
    }
  });
});

describe("Product page", () => {
  it("leads with its type, name, manufacturer, size, how it is sold and its barcode", async () => {
    const { app } = seeded();
    const res = await app.request(`/products/${MILK}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<a class="breadcrumb" href="/products?type=dairy-eggs">Products · Dairy &amp; eggs</a>');
    expect(html).toContain('<h1><span lang="he">חלב 3% 1 ליטר</span></h1>');
    expect(html).toContain(`<span lang="he">תנובה</span> · 1 l · sold by the unit · barcode ${MILK}`);
  });

  it("shows the Product image in a tile that is a button, and the type form with its note", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/products/${MILK}`)).text();
    const tile = html.slice(html.indexOf('<button type="button" class="image-tile" id="product-image" aria-label="Change the Product image">'));
    expect(tile.slice(0, tile.indexOf("</button>"))).toContain(`<img src="${IMAGE}"`);
    expect(html).toContain(">Save type</button>");
    expect(html).toContain("A type you save here is never changed by a Price sync.");
  });

  it("names the Product group it is in, with its size and measure, linking to the group", async () => {
    const { app, api } = seeded();
    expect(await (await app.request(`/products/${MILK}`)).text()).toContain("In no Product group");
    await refreshBrowse(api.db);
    const html = await (await app.request(`/products/${MILK}`)).text();
    expect(html).toContain(`<a href="/groups?ref=${encodeURIComponent("חלב|l")}" lang="he">חלב</a>`);
    expect(html).toContain("1 Product · by the liter");
  });

  it("says where it is sold and from what price, then its prices cheapest first with the Promotion running there", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/products/${MILK}`)).text();
    expect(html).toContain("2 stores in 2 Chains · from ₪5.90");
    const prices = html.slice(html.indexOf("<h2>Prices, cheapest first</h2>"));
    expect(prices.indexOf("₪5.90")).toBeLessThan(prices.indexOf("₪6.90"));
    expect(prices).toContain(`<a href="/stores/${RAMI}-1" lang="he">רמי לוי תלפיות</a>`);
    expect(prices).toContain("Today 12:00");
    expect(prices).toContain('<span class="deal" lang="he">2 ב-₪10</span> for club members');
  });

  it("lists its Promotions once per Chain with their stores, who, dates and a state badge, running first", async () => {
    const { app, api } = seeded();
    const ended = (storeId: string) => ({
      storeId, promotionId: "P0", description: "חלב ב-5 שנגמר", kind: "price" as const, minQty: 1, amount: 5, audience: "all" as const,
      startsAt: new Date(NOW.getTime() - 9 * DAY), endsAt: new Date(NOW.getTime() - 2 * DAY),
    });
    api.db.insert(stores).values({ id: `${OSHER}-2`, chainId: OSHER, storeId: "2", subChainId: "1", name: "אושר עד בית שמש", address: "רחוב 2", city: "בית שמש" }).run();
    api.db.insert(prices).values({ storeId: `${OSHER}-2`, code: MILK, price: 7.1, updatedAt: NOW }).run();
    const rows = api.db.insert(promotions).values([ended(`${OSHER}-1`), ended(`${OSHER}-2`)]).returning({ id: promotions.id }).all();
    api.db.insert(promotionItems).values(rows.map(({ id }) => ({ promotionId: id, code: MILK }))).run();
    const html = await (await app.request(`/products/${MILK}`)).text();
    const section = html.slice(html.indexOf("<h2>Promotions on this Product</h2>"));
    expect(section).toMatch(/<h2>Promotions on this Product<\/h2><span>2<\/span>/);
    expect(section).toContain(`href="/promotions/${rows[0]!.id}"`);
    expect(section).not.toContain(`href="/promotions/${rows[1]!.id}"`);
    for (const text of ["Osher Ad · 2 stores", "Rami Levy · 1 store", "Everyone", "Club", "Oct 27 – Nov 3", '<span class="badge badge-skipped">Ended</span>']) expect(section).toContain(text);
    expect(section.indexOf('<span class="badge badge-ok">Running</span>')).toBeLessThan(section.indexOf("badge-skipped"));
  });

  it("shows a Chain-only Product with no image and no Product type yet, sold by weight", async () => {
    const { app, looked } = seeded();
    const res = await app.request(`/products/${encodeURIComponent(LOCAL)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("בננות");
    expect(html).toContain("No Product image");
    expect(html).toContain('<a class="breadcrumb" href="/products?type=none">Products · No type yet</a>');
    expect(html).toContain("No type yet: the Product type step of the next Price sync chooses one.");
    expect(html).toContain("sold by weight · Chain code 111");
    expect(looked).toEqual([LOCAL]);
  });

  it("answers 404 for an unknown Product", async () => {
    const { app } = seeded();
    for (const code of ["123", "1".repeat(65)]) {
      const res = await app.request(`/products/${code}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("No Product with this code");
    }
  });
});

describe("Product image fragment", () => {
  it("is the Product's image, or a dash when it has none or the code names none", async () => {
    const { app, looked } = seeded();
    const res = await app.request(`/products/${MILK}/image`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`<img src="${IMAGE}"`);
    for (const code of [encodeURIComponent(LOCAL), "1".repeat(65)]) {
      const none = await app.request(`/products/${code}/image`);
      expect(none.status).toBe(200);
      expect(await none.text()).not.toContain("<img");
    }
    expect(looked).toEqual([MILK, LOCAL]);
  });
});
