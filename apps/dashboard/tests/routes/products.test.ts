import { describe, expect, it } from "vitest";
import { prices, products, promotionItems, promotions, stores } from "api/src/db/appSchema.ts";
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
  const ctx = setup({ api: { clock: fakeClock(NOW) }, productImage });
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
  it("shows the search form and no results before a search", async () => {
    const { app } = seeded();
    const res = await app.request("/products");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="q"');
    expect(html).not.toContain("<tbody>");
  });

  it("lists the Products a name search finds, each linking to its page", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/products?q=${encodeURIComponent("חלב")}`)).text();
    expect(html).toContain("חלב 3% 1 ליטר");
    expect(html).toContain("תנובה");
    expect(html).toContain(`href="/products/${MILK}"`);
    expect(html).toContain("₪5.90");
    expect(html).toContain("dairy-eggs");
    expect(html).not.toContain("בננות");
  });

  it("loads each result's image when its row scrolls into view", async () => {
    const { app, looked } = seeded();
    const html = await (await app.request(`/products?q=${encodeURIComponent("חלב")}`)).text();
    expect(looked).toEqual([]);
    expect(html).toContain(`hx-get="/products/${MILK}/image" hx-trigger="intersect once"`);
  });

  it("finds the Product by barcode", async () => {
    const { app } = seeded();
    const html = await (await app.request(`/products?q=${MILK}`)).text();
    expect(html).toContain("חלב 3% 1 ליטר");
  });

  it("says when nothing matches, and when the query is too short", async () => {
    const { app } = seeded();
    expect(await (await app.request("/products?q=zzzz")).text()).toContain("No Products match");
    const short = await app.request("/products?q=a");
    expect(short.status).toBe(200);
    expect(await short.text()).toContain("at least 2 characters");
  });
});

describe("Products by Product type", () => {
  it("lists the Products with no Product type yet, without a search, with that filter chosen", async () => {
    const { app } = seeded();
    const res = await app.request("/products?type=none");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("בננות");
    expect(html).not.toContain("חלב 3% 1 ליטר");
    expect(html).toContain('<option value="none" selected>');
  });

  it("narrows a search to one Product type", async () => {
    const { app } = seeded();
    const milk = encodeURIComponent("חלב");
    expect(await (await app.request(`/products?q=${milk}&type=dairy-eggs`)).text()).toContain("חלב 3% 1 ליטר");
    expect(await (await app.request(`/products?q=${milk}&type=frozen`)).text()).toContain("No Products match");
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
  it("shows the Product image, its details, its prices cheapest first and its running Promotions", async () => {
    const { app } = seeded();
    const res = await app.request(`/products/${MILK}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<img src="${IMAGE}"`);
    for (const text of ["חלב 3% 1 ליטר", "תנובה", "1 l", "By the unit", "dairy-eggs", "רמי לוי תלפיות", "Rami Levy", "אושר עד גבעת שאול", "2 ב-₪10", "club"])
      expect(html).toContain(text);
    expect(html.indexOf("₪5.90")).toBeLessThan(html.indexOf("₪6.90"));
  });

  it("lists the Product's Promotions at the stores that price it, each marked by state, linking to the Promotion", async () => {
    const { app, api } = seeded();
    const [ended] = api.db
      .insert(promotions)
      .values({
        storeId: `${OSHER}-1`, promotionId: "P0", description: "חלב ב-5 שנגמר", kind: "price", minQty: 1, amount: 5, audience: "all",
        startsAt: new Date(NOW.getTime() - 9 * DAY), endsAt: new Date(NOW.getTime() - 2 * DAY),
      })
      .returning({ id: promotions.id })
      .all();
    api.db.insert(promotionItems).values({ promotionId: ended!.id, code: MILK }).run();
    const html = await (await app.request(`/products/${MILK}`)).text();
    const section = html.slice(html.indexOf("<h2>Promotions</h2>"));
    expect(section).toContain(`href="/promotions/${ended!.id}"`);
    expect(section).toContain('class="badge badge-promo-ended"');
    expect(section.indexOf("badge-promo-running")).toBeLessThan(section.indexOf("badge-promo-ended"));
    expect(section).toContain("אושר עד גבעת שאול");
  });

  it("shows a Chain-only Product with no image and no Product type yet, sold by weight", async () => {
    const { app, looked } = seeded();
    const res = await app.request(`/products/${encodeURIComponent(LOCAL)}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("בננות");
    expect(html).toContain("No Product image");
    expect(html).toContain("None yet");
    expect(html).toContain("By weight");
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
