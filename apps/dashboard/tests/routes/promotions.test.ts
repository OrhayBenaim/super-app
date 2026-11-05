import { describe, expect, it } from "vitest";
import { prices, products, promotionItems, promotions, stores } from "api/src/db/appSchema.ts";
import { setup } from "../seam.ts";

const NOW = new Date("2026-11-05T10:00:00Z"); // a Thursday in Israel
const DAY = 86_400_000;
const RAMI = "7290058140886";
const TALPIOT = `${RAMI}-1`;
const AFULA = `${RAMI}-2`;
const MILK = "7290000066318";

/** Rami Levy: a club deal on milk at two stores, a weekend-only one, a future, an ended and an information-only one at Talpiot. */
function seeded() {
  const ctx = setup({ now: NOW });
  const { db } = ctx.api;
  const store = (id: string, name: string, city: string) => ({ id, chainId: RAMI, storeId: id.split("-")[1]!, subChainId: "1", name, address: "הרצל 1", city });
  db.insert(stores).values([store(TALPIOT, "רמי לוי תלפיות", "ירושלים"), store(AFULA, "רמי לוי עפולה", "עפולה")]).run();
  db.insert(products).values({ code: MILK, name: "חלב 3% 1 ליטר" }).run();
  db.insert(prices).values([{ storeId: TALPIOT, code: MILK, price: 6.9 }, { storeId: AFULA, code: MILK, price: 6.5 }]).run();
  const promo = (storeId: string, promotionId: string, description: string, from: number, to: number, extra: Partial<typeof promotions.$inferInsert> = {}) => ({
    storeId, promotionId, description, kind: "bundle" as const, minQty: 2, amount: 10, audience: "club" as const,
    startsAt: new Date(NOW.getTime() + from * DAY), endsAt: new Date(NOW.getTime() + to * DAY), ...extra,
  });
  const ids = db
    .insert(promotions)
    .values([
      promo(TALPIOT, "P1", "2 חלב ב-10", -1, 1, { limitQty: 4 }),
      promo(AFULA, "P1", "2 חלב ב-10", -1, 1, { limitQty: 4 }),
      promo(TALPIOT, "P2", "סופ״ש", -1, 3, { days: "6,7", kind: "price", minQty: 1, amount: 1 }),
      promo(TALPIOT, "P3", "בקרוב", 1, 3),
      promo(TALPIOT, "P4", "נגמר", -3, -1),
      promo(TALPIOT, "P5", "משלוח חינם", -1, 1, { kind: "info", minQty: 1, amount: 0, audience: "all" }),
    ])
    .returning({ id: promotions.id })
    .all()
    .map((r) => r.id);
  db.insert(promotionItems).values([{ promotionId: ids[0]!, code: MILK }, { promotionId: ids[1]!, code: MILK }]).run();
  return { ...ctx, deal: ids[0]!, weekend: ids[2]! };
}

describe("Promotions page", () => {
  it("lists one row per Promotion across its Chain's stores, running ones first by most stores, with the state chips' counts", async () => {
    const { app, deal } = seeded();
    const res = await app.request("/promotions");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/promotions" aria-current="page"');
    expect(html).toContain("3 running in 2 stores · 1 are information only");
    expect(html).toMatch(/<td><a href="\/promotions\/\d+" lang="he" dir="rtl">2 חלב ב-10<\/a><\/td>\s*<td>Rami Levy<\/td>\s*<td><strong lang="he" dir="rtl">2 ב-₪10<\/strong><\/td>\s*<td>Club<\/td>\s*<td>Nov 4 – Nov 6<\/td>\s*<td class="num">2<\/td>\s*<td class="num">1<\/td>/);
    expect(html).toContain(`href="/promotions/${deal}"`);
    // the weekend one: within its dates, so under Running, but badged as its page badges it
    expect(html).toMatch(/<strong lang="he" dir="rtl">₪1<\/strong><\/td>\s*<td>Club<\/td>\s*<td>Nov 4 – Nov 8 <span class="badge badge-finished">Not today<\/span><\/td>/);
    expect(html).toContain('<span class="muted">Information only</span>');
    expect(html).toContain("Information only: the Chain describes it but gives no price");
    expect(html).not.toContain("בקרוב");
    expect(html).toContain('<a class="chip" href="/promotions?state=running" aria-current="true">Running <span class="count">3</span></a>');
    expect(html).toContain('<a class="chip" href="/promotions?state=future">Starts later <span class="count">1</span></a>');
    expect(html).toContain('<a class="chip" href="/promotions?state=ended">Ended <span class="count">1</span></a>');
    const order = ["2 חלב ב-10", "סופ״ש", "משלוח חינם"].map((d) => html.indexOf(d));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("filters by store, Chain, kind and state, keeping the other filters in the chips", async () => {
    const { app } = seeded();
    const store = await (await app.request(`/promotions?store=${AFULA}`)).text();
    expect(store).toContain("2 חלב ב-10");
    expect(store).not.toContain("משלוח חינם");
    expect(store).toContain(`<option value="${AFULA}" selected>רמי לוי עפולה</option>`);
    expect(store).toContain(`<option value="${RAMI}" selected>Rami Levy</option>`); // the store's Chain
    expect(store).toContain(`href="/promotions?store=${AFULA}&amp;state=future"`);

    const info = await (await app.request(`/promotions?chain=${RAMI}&store=&kind=info`)).text();
    expect(info).toContain("משלוח חינם");
    expect(info).not.toContain("2 חלב ב-10");
    expect(info).toContain(`<option value="${RAMI}" selected>Rami Levy</option>`);
    expect(info).toContain('<option value="info" selected>Information only</option>');

    const ended = await (await app.request("/promotions?state=ended")).text();
    expect(ended).toContain("נגמר");
    expect(ended).toContain("Nov 2 – Nov 4");
    expect(ended).not.toContain("2 חלב ב-10");
  });

  it("is where a store's page links for its Promotions", async () => {
    const { app } = seeded();
    expect(await (await app.request(`/stores/${TALPIOT}`)).text()).toContain(`href="/promotions?store=${TALPIOT}"`);
    expect((await app.request(`/stores/${TALPIOT}/promotions`)).status).toBe(404);
  });

  it("answers an unknown store with 404 and a filter the form does not offer with 400", async () => {
    const { app } = seeded();
    expect((await app.request("/promotions?store=nope")).status).toBe(404);
    expect((await app.request("/promotions?kind=free")).status).toBe(400);
    expect((await app.request("/promotions?page=x")).status).toBe(400);
  });
});

describe("Promotion page", () => {
  it("shows the terms, each Product at the cheapest store with its price on the Promotion and the saving, and the stores", async () => {
    const { app, deal } = seeded();
    const res = await app.request(`/promotions/${deal}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<a class="breadcrumb" href="/promotions">Promotions</a>');
    expect(html).toContain("2 חלב ב-10");
    expect(html).toContain("Rami Levy · Promotion P1 · 2 stores · 1 Product");
    expect(html).toContain('<span class="badge badge-ok">Running</span>');
    expect(html).toContain('<strong lang="he" dir="rtl">2 ב-₪10</strong> (₪5.00 each)');
    expect(html).toContain("Up to 4");
    expect(html).toContain("Nov 4 – Nov 6, 2026 · every day");
    expect(html).toContain("kind bundle · minQty 2 · amount 10 · limitQty 4 · combines 1");
    expect(html).toContain("Shelf price at the cheapest of the 2 stores");
    // milk is ₪6.50 at Afula, ₪5 each on the Promotion
    expect(html).toMatch(/href="\/products\/7290000066318" lang="he" dir="rtl">חלב 3% 1 ליטר<\/a><\/td>\s*<td class="num">₪6.50<\/td>\s*<td class="num saving">₪5.00<\/td>\s*<td class="num saving">₪1.50<\/td>/);
    expect(html).toContain(`href="/stores/${AFULA}"`);
    expect(html).toContain(`href="/stores/${TALPIOT}"`);
    expect(html).toContain("עפולה");
  });

  it("marks one within its dates but not today as not today, and says which days it runs", async () => {
    const { app, weekend } = seeded();
    const html = await (await app.request(`/promotions/${weekend}`)).text();
    expect(html).toContain(">Not today</span>");
    expect(html).toContain("· Fri, Sat");
  });

  it("answers an unknown or malformed id with 404", async () => {
    const { app } = seeded();
    expect((await app.request("/promotions/99999")).status).toBe(404);
    expect((await app.request("/promotions/abc")).status).toBe(404);
    expect((await app.request("/promotions/-1")).status).toBe(404);
  });
});
