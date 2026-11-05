import { describe, expect, it } from "vitest";
import { prices, products, stores } from "api/src/db/appSchema.ts";
import type { Deps } from "#/deps.ts";
import { setup } from "../seam.ts";

const RAMI = "7290058140886";
const OSHER = "7290103152017";
const FINE = "7290000000011";
const COARSE = "7290000000035";
const IMAGE = "https://img.example/bulgur.jpg";

/** Fine and coarse bulgur at two stores; only the fine one has a Product image. */
function seeded(productImage: Deps["productImage"] = async (code) => (code === FINE ? IMAGE : null)) {
  const ctx = setup({ productImage });
  const { db } = ctx.api;
  const store = (chainId: string, name: string) => ({ id: `${chainId}-1`, chainId, storeId: "1", subChainId: "1", name, address: "רחוב 1", city: "ירושלים" });
  db.insert(stores).values([store(RAMI, "רמי לוי תלפיות"), store(OSHER, "אושר עד גבעת שאול")]).run();
  db.insert(products)
    .values([
      { code: FINE, name: "בורגול דק סוגת", unitQty: "500 גרם" },
      { code: "7290000000028", name: "בורגול דק מיה", unitQty: "500 גרם" },
      { code: COARSE, name: "בורגול עבה סוגת", unitQty: "1 קילוגרם" },
      { code: "7290000000042", name: "בורגול עבה מיה", unitQty: "1 קילוגרם" },
    ])
    .run();
  db.insert(prices)
    .values([
      { storeId: `${RAMI}-1`, code: FINE, price: 3.5 },
      { storeId: `${OSHER}-1`, code: "7290000000028", price: 3.9 },
      { storeId: `${OSHER}-1`, code: COARSE, price: 6.8 },
      { storeId: `${RAMI}-1`, code: "7290000000042", price: 7.2 },
    ])
    .run();
  return ctx;
}

describe("Product groups page", () => {
  it("shows the search form and no group before a search", async () => {
    const { app } = seeded();
    const res = await app.request("/groups");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="q"');
    expect(html).not.toContain("<tbody>");
  });

  it("shows the group the words name: measure, commonest pack, refinements and members with image and cheapest price", async () => {
    const { app } = seeded();
    const res = await app.request(`/groups?q=${encodeURIComponent("בורגול")}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const text of ["בורגול|kg", "By the kilo", "0.5 kg", "₪6.80", "4 Products", "2 stores", "בורגול דק סוגת", "בורגול עבה מיה", "₪3.50", "₪7.20"])
      expect(html).toContain(text);
    expect(html).toContain(`href="/groups?${new URLSearchParams({ q: "בורגול דק" })}"`);
    expect(html).toContain(`href="/groups?${new URLSearchParams({ q: "בורגול עבה" })}"`);
    expect(html).toContain(`href="/products/${COARSE}"`);
    // Cheapest per kilo first: the coarse 1 kg at 6.80 before the fine 500 g at 3.50 (7.00 a kilo)
    expect(html.indexOf("בורגול עבה סוגת")).toBeLessThan(html.indexOf("בורגול דק סוגת"));
  });

  it("loads each member's image when its row is revealed, with no lookup up front", async () => {
    const looked: string[] = [];
    const { app } = seeded(async (code) => (looked.push(code), null));
    const html = await (await app.request(`/groups?q=${encodeURIComponent("בורגול")}`)).text();
    expect(looked).toEqual([]);
    expect(html).toContain(`hx-get="/products/${FINE}/image" hx-trigger="revealed"`);
    expect(html).toContain(`hx-get="/products/${COARSE}/image" hx-trigger="revealed"`);
  });

  it("says when the words name no group, and when they are too short or too long", async () => {
    const { app } = seeded();
    expect(await (await app.request(`/groups?q=${encodeURIComponent("חומוס")}`)).text()).toContain("No Product group");
    expect(await (await app.request("/groups?q=a")).text()).toContain("at least 2 characters");
    expect((await app.request(`/groups?q=${"א".repeat(101)}`)).status).toBe(400);
  });

  it("links the group page from the dashboard's navigation", async () => {
    const { app } = seeded();
    expect(await (await app.request("/products")).text()).toContain('href="/groups"');
  });
});
