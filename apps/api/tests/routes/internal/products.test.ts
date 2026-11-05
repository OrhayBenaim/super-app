import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { prices, products, promotionItems, promotions, stores } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const TOKEN = "test-sync-token";
const NOW = new Date("2026-11-05T10:00:00Z"); // a Thursday in Israel
const DAY = 86_400_000;
const RAMI = "7290058140886";
const OSHER = "7290103152017";
const MILK = "7290000066318";
const LOCAL = `${OSHER}:111`;

const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }), { clock: fakeClock(NOW) });
const get = (deps: Deps, path: string, auth = `Bearer ${TOKEN}`) => createInternalApp(deps).request(path, { headers: { Authorization: auth } });

/** Milk at three stores of two Chains, a running and an ended Promotion on it, and some other Products. */
function seed(deps: Deps) {
  const store = (chainId: string, storeId: string, name: string) => ({ id: `${chainId}-${storeId}`, chainId, storeId, subChainId: "1", name, address: "רחוב 1", city: "תל אביב", lat: 32.08, lng: 34.78 });
  deps.db.insert(stores).values([store(RAMI, "1", "רמי לוי תלפיות"), store(OSHER, "1", "אושר עד גבעת שאול"), store(OSHER, "2", "אושר עד בית שמש")]).run();
  deps.db
    .insert(products)
    .values([
      { code: MILK, name: "חלב 3% 1 ליטר", manufacturer: "תנובה", unitQty: "ליטר", productType: "dairy-eggs" },
      { code: "7290000066325", name: "שוקולד חלב", manufacturer: "עלית", unitQty: "יחידה" },
      { code: LOCAL, name: "בננות", unitQty: "קילוגרם", isWeighted: true },
      { code: "7290000066332", name: "חלב שלא נמכר" },
    ])
    .run();
  deps.db
    .insert(prices)
    .values([
      { storeId: `${OSHER}-1`, code: MILK, price: 6.9, updatedAt: new Date(NOW.getTime() - DAY) },
      { storeId: `${RAMI}-1`, code: MILK, price: 5.9, updatedAt: NOW },
      { storeId: `${OSHER}-2`, code: MILK, price: 6.5, updatedAt: NOW },
      { storeId: `${OSHER}-1`, code: "7290000066325", price: 8 },
      { storeId: `${OSHER}-1`, code: LOCAL, price: 9.9 },
    ])
    .run();
  const promo = (storeId: string, promotionId: string, startsAt: number, endsAt: number) => ({
    storeId, promotionId, description: "2 ב-10", kind: "bundle" as const, minQty: 2, amount: 10, audience: "club" as const,
    startsAt: new Date(startsAt), endsAt: new Date(endsAt),
  });
  const ids = deps.db
    .insert(promotions)
    .values([promo(`${RAMI}-1`, "P1", NOW.getTime() - DAY, NOW.getTime() + DAY), promo(`${OSHER}-1`, "P2", NOW.getTime() - 3 * DAY, NOW.getTime() - DAY)])
    .returning({ id: promotions.id })
    .all();
  deps.db.insert(promotionItems).values(ids.map(({ id }) => ({ promotionId: id, code: MILK }))).run();
}

type Found = { products: { code: string; name: string; productType: string | null }[]; hasMore: boolean };

describe("GET /products (private search)", () => {
  it("finds Products by name like the public search, with their Product type", async () => {
    const deps = setup();
    seed(deps);
    const res = await get(deps, `/products?q=${encodeURIComponent("חלב")}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Found;
    expect(body.hasMore).toBe(false);
    expect(body.products).toEqual([
      {
        code: MILK, name: "חלב 3% 1 ליטר", manufacturer: "תנובה", unitQty: "ליטר", storeCount: 3, minPrice: 5.9, measure: "l", size: 1,
        soldBy: "unit", productType: "dairy-eggs",
      },
      expect.objectContaining({ code: "7290000066325", name: "שוקולד חלב", productType: null }),
    ]);

    // The same Products, in the same order, as the app's search
    const app = createApp(deps);
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "password1234", name: "A" }),
    });
    const cookie = signUp.headers.getSetCookie().map((h) => h.split(";")[0]).join("; ");
    const pub = (await (await app.request(`/api/products/search?q=${encodeURIComponent("חלב")}`, { headers: { cookie } })).json()) as { kind: string; code: string }[];
    expect(pub.some((r) => r.kind === "product")).toBe(true);
    expect(body.products.map((p) => p.code)).toEqual(pub.filter((r) => r.kind === "product").map((r) => r.code));
  });

  it("finds the exact Product by barcode, first", async () => {
    const deps = setup();
    seed(deps);
    const body = (await (await get(deps, `/products?q=${MILK}`)).json()) as Found;
    expect(body.products[0]).toMatchObject({ code: MILK, name: "חלב 3% 1 ליטר" });
    expect(body.products).toHaveLength(1);
  });

  it("pages the results", async () => {
    const deps = setup();
    seed(deps);
    const first = (await (await get(deps, `/products?q=${encodeURIComponent("חלב")}&pageSize=1`)).json()) as Found;
    const second = (await (await get(deps, `/products?q=${encodeURIComponent("חלב")}&pageSize=1&page=2`)).json()) as Found;
    expect(first).toMatchObject({ products: [{ code: MILK }], hasMore: true });
    expect(second).toMatchObject({ products: [{ code: "7290000066325" }], hasMore: false });
  });

  it("filters the search by Product type, or by none yet", async () => {
    const deps = setup();
    seed(deps);
    const codes = async (query: string) => ((await (await get(deps, `/products?${query}`)).json()) as Found).products.map((p) => p.code);
    const milk = encodeURIComponent("חלב");
    expect(await codes(`q=${milk}&type=dairy-eggs`)).toEqual([MILK]);
    expect(await codes(`q=${milk}&type=none`)).toEqual(["7290000066325"]);
    expect(await codes(`q=${milk}&type=frozen`)).toEqual([]);
  });

  it("lists every priced Product of a Product type without a query, most widely priced first, a page at a time", async () => {
    const deps = setup();
    seed(deps);
    const res = await get(deps, "/products?type=none");
    expect(res.status).toBe(200);
    // The unpriced Product is left out, as in the search
    expect(await res.json()).toEqual({
      products: [
        {
          code: "7290000066325", name: "שוקולד חלב", manufacturer: "עלית", unitQty: "יחידה", storeCount: 1, minPrice: 8, measure: null, size: null,
          soldBy: "unit", productType: null,
        },
        expect.objectContaining({ code: LOCAL, soldBy: "weight", productType: null }),
      ],
      hasMore: false,
    });
    const first = (await (await get(deps, "/products?type=none&pageSize=1")).json()) as Found;
    const second = (await (await get(deps, "/products?type=none&pageSize=1&page=2")).json()) as Found;
    expect(first).toMatchObject({ products: [{ code: "7290000066325" }], hasMore: true });
    expect(second).toMatchObject({ products: [{ code: LOCAL }], hasMore: false });
    expect(((await (await get(deps, "/products?type=dairy-eggs")).json()) as Found).products.map((p) => p.code)).toEqual([MILK]);
  });

  it("400 for a missing or too short query, a bad page, or a type outside the fixed list", async () => {
    const deps = setup();
    for (const q of ["", "?q=a", "?q=milk&page=0", "?q=milk&page=x", "?q=milk&pageSize=101", "?q=milk&type=soup", "?type=untyped"]) expect((await get(deps, `/products${q}`)).status).toBe(400);
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    expect((await createInternalApp(deps).request("/products?q=milk")).status).toBe(401);
    expect((await get(deps, "/products?q=milk", "Bearer wrong")).status).toBe(401);
  });
});

describe("GET /products/:code (private)", () => {
  it("returns the Product with its prices per Chain and store, cheapest first, and the Promotions running on it", async () => {
    const deps = setup();
    seed(deps);
    const res = await get(deps, `/products/${MILK}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      product: {
        code: MILK, name: "חלב 3% 1 ליטר", manufacturer: "תנובה", unitQty: "ליטר", measure: "l", size: 1, soldBy: "unit", productType: "dairy-eggs",
      },
      prices: [
        {
          storeId: `${RAMI}-1`, storeName: "רמי לוי תלפיות", city: "תל אביב", chainId: RAMI, chainName: "Rami Levy", chainNameHe: "רמי לוי", price: 5.9,
          updatedAt: NOW.toISOString(),
          promotions: [{ id: "P1", kind: "bundle", description: "2 ב-10", text: "2 ב-₪10", minQty: 2, amount: 10, audience: "club", limitQty: null, minPurchase: null }],
        },
        expect.objectContaining({ storeId: `${OSHER}-2`, price: 6.5, promotions: [] }),
        // The ended Promotion is not running
        expect.objectContaining({ storeId: `${OSHER}-1`, price: 6.9, updatedAt: new Date(NOW.getTime() - DAY).toISOString(), promotions: [] }),
      ],
      promotions: [expect.objectContaining({ promotionId: "P1" }), expect.objectContaining({ promotionId: "P2" })],
    });
  });

  it("lists every Promotion on it at the stores that price it, each marked running, not today, future or ended, running first", async () => {
    const deps = setup();
    seed(deps);
    const later = { kind: "price" as const, minQty: 1, amount: 5, audience: "all" as const, description: "5 ש״ח" };
    const extra = deps.db
      .insert(promotions)
      .values([
        { ...later, storeId: `${OSHER}-2`, promotionId: "P3", startsAt: new Date(NOW.getTime() + DAY), endsAt: new Date(NOW.getTime() + 2 * DAY) },
        // Fridays and Saturdays only; NOW is a Thursday
        { ...later, storeId: `${OSHER}-2`, promotionId: "P4", startsAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 7 * DAY), days: "6,7" },
      ])
      .returning({ id: promotions.id })
      .all();
    deps.db.insert(promotionItems).values(extra.map(({ id }) => ({ promotionId: id, code: MILK }))).run();
    const body = (await (await get(deps, `/products/${MILK}`)).json()) as { promotions: Record<string, unknown>[] };
    expect(body.promotions.map((p) => [p.promotionId, p.state])).toEqual([["P1", "running"], ["P4", "notToday"], ["P3", "future"], ["P2", "ended"]]);
    expect(body.promotions[0]).toEqual({
      id: expect.any(Number), promotionId: "P1", storeId: `${RAMI}-1`, storeName: "רמי לוי תלפיות", chainName: "Rami Levy", description: "2 ב-10",
      kind: "bundle", audience: "club", startsAt: new Date(NOW.getTime() - DAY).toISOString(), endsAt: new Date(NOW.getTime() + DAY).toISOString(),
      days: null, state: "running", text: "2 ב-₪10",
    });
  });

  it("reads a Chain-only code", async () => {
    const deps = setup();
    seed(deps);
    const body = (await (await get(deps, `/products/${encodeURIComponent(LOCAL)}`)).json()) as { product: { code: string; soldBy: string } };
    expect(body.product).toMatchObject({ code: LOCAL, soldBy: "weight" });
  });

  it("404 for an unknown code", async () => {
    const deps = setup();
    expect((await get(deps, "/products/123")).status).toBe(404);
  });

  it("400 for a code longer than 64 characters", async () => {
    const deps = setup();
    expect((await get(deps, `/products/${"1".repeat(65)}`)).status).toBe(400);
  });

  it("401 without the token", async () => {
    const deps = setup();
    seed(deps);
    expect((await createInternalApp(deps).request(`/products/${MILK}`)).status).toBe(401);
  });
});

describe("PUT /products/:code/type (private)", () => {
  const put = (deps: Deps, code: string, body: unknown, auth = `Bearer ${TOKEN}`) =>
    createInternalApp(deps).request(`/products/${encodeURIComponent(code)}/type`, {
      method: "PUT",
      headers: { Authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("sets the Product's type, which the Product and the type filter then show", async () => {
    const deps = setup();
    seed(deps);
    const res = await put(deps, LOCAL, { productType: "produce" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: LOCAL, productType: "produce" });
    expect(((await (await get(deps, `/products/${encodeURIComponent(LOCAL)}`)).json()) as { product: object }).product).toMatchObject({ productType: "produce" });
    expect(((await (await get(deps, "/products?type=produce")).json()) as Found).products.map((p) => p.code)).toEqual([LOCAL]);

    // And changes one the classifier gave
    await put(deps, MILK, { productType: "other" });
    expect(((await (await get(deps, "/products?type=other")).json()) as Found).products.map((p) => p.code)).toEqual([MILK]);
  });

  it("400 for a type outside the fixed list, none, or a body that is not one", async () => {
    const deps = setup();
    seed(deps);
    for (const body of [{ productType: "soup" }, { productType: null }, { productType: "none" }, {}, "produce"]) expect((await put(deps, MILK, body)).status).toBe(400);
    const raw = (headers: Record<string, string>) =>
      createInternalApp(deps).request(`/products/${MILK}/type`, { method: "PUT", headers: { Authorization: `Bearer ${TOKEN}`, ...headers }, body: "{x" });
    expect((await raw({})).status).toBe(400);
    expect((await raw({ "content-type": "application/json" })).status).toBe(400);
    expect(((await (await get(deps, `/products/${MILK}`)).json()) as { product: object }).product).toMatchObject({ productType: "dairy-eggs" });
  });

  it("404 for an unknown code", async () => {
    const deps = setup();
    expect((await put(deps, "123", { productType: "produce" })).status).toBe(404);
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    seed(deps);
    expect((await put(deps, MILK, { productType: "produce" }, "")).status).toBe(401);
    expect((await put(deps, MILK, { productType: "produce" }, "Bearer wrong")).status).toBe(401);
    expect(((await (await get(deps, `/products/${MILK}`)).json()) as { product: object }).product).toMatchObject({ productType: "dairy-eggs" });
  });
});
