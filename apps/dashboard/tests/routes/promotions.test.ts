import { describe, expect, it } from "vitest";
import { prices, products, promotionItems, promotions, stores } from "api/src/db/appSchema.ts";
import { fakeClock } from "api/src/utils/clock.ts";
import { setup } from "../seam.ts";

const NOW = new Date("2026-11-05T10:00:00Z"); // a Thursday in Israel
const DAY = 86_400_000;
const RAMI = "7290058140886";
const STORE = `${RAMI}-1`;
const MILK = "7290000066318";

/** A store with a running club deal on milk, a weekend-only, a future, an ended and an information-only Promotion. */
function seeded() {
  const ctx = setup({ api: { clock: fakeClock(NOW) } });
  const { db } = ctx.api;
  db.insert(stores).values({ id: STORE, chainId: RAMI, storeId: "1", subChainId: "1", name: "רמי לוי תלפיות", address: "הרצל 1", city: "ירושלים" }).run();
  db.insert(products).values({ code: MILK, name: "חלב 3% 1 ליטר" }).run();
  db.insert(prices).values({ storeId: STORE, code: MILK, price: 6.9, updatedAt: NOW }).run();
  const promo = (promotionId: string, description: string, from: number, to: number, extra: Partial<typeof promotions.$inferInsert> = {}) => ({
    storeId: STORE, promotionId, description, kind: "bundle" as const, minQty: 2, amount: 10, audience: "club" as const,
    startsAt: new Date(NOW.getTime() + from * DAY), endsAt: new Date(NOW.getTime() + to * DAY), ...extra,
  });
  const [running] = db
    .insert(promotions)
    .values([
      promo("P1", "2 חלב ב-10", -1, 1, { limitQty: 4 }),
      promo("P2", "סופ״ש", -1, 3, { days: "6,7" }),
      promo("P3", "בקרוב", 1, 3),
      promo("P4", "נגמר", -3, -1),
      promo("P5", "משלוח חינם", -1, 1, { kind: "info", minQty: 1, amount: 0, audience: "all" }),
    ])
    .returning({ id: promotions.id })
    .all();
  db.insert(promotionItems).values({ promotionId: running!.id, code: MILK }).run();
  return { ...ctx, runningId: running!.id };
}

describe("A store's Promotions page", () => {
  it("lists the store's Promotions with their terms, running ones first and badged, the others marked", async () => {
    const { app, runningId } = seeded();
    const res = await app.request(`/stores/${STORE}/promotions`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("רמי לוי תלפיות");
    expect(html).toContain(`href="/promotions/${runningId}"`);
    expect(html).toContain("2 חלב ב-10");
    expect(html).toContain("Club");
    expect(html).toContain("₪10.00");
    expect(html).toContain("Fri, Sat"); // the weekend-only one's days
    expect(html).toContain("Up to 4");
    expect(html).toContain("Information only");
    // running first (the deal, then the information-only one), then not today, future and ended
    const order = ["2 חלב ב-10", "משלוח חינם", "סופ״ש", "בקרוב", "נגמר"].map((d) => html.indexOf(d));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const badge of ["Running", "Not today", "Future", "Ended"]) expect(html).toContain(`>${badge}</span>`);
  });

  it("is linked from the store's page", async () => {
    const { app } = seeded();
    expect(await (await app.request(`/stores/${STORE}`)).text()).toContain(`href="/promotions?store=${STORE}"`);
  });

  it("answers an unknown store with 404", async () => {
    const { app } = seeded();
    expect((await app.request("/stores/nope/promotions")).status).toBe(404);
    expect((await app.request(`/stores/${"1".repeat(65)}/promotions`)).status).toBe(404);
  });
});

describe("Promotion page", () => {
  it("shows the Promotion's terms and its Products with their Shelf price at the store", async () => {
    const { app, runningId } = seeded();
    const res = await app.request(`/promotions/${runningId}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("2 חלב ב-10");
    expect(html).toContain(`href="/stores/${STORE}/promotions"`);
    expect(html).toContain(`href="/products/${MILK}"`);
    expect(html).toContain("חלב 3% 1 ליטר");
    expect(html).toContain("₪6.90");
    expect(html).toContain(">Running</span>");
  });

  it("answers an unknown or malformed id with 404", async () => {
    const { app } = seeded();
    expect((await app.request("/promotions/99999")).status).toBe(404);
    expect((await app.request("/promotions/abc")).status).toBe(404);
    expect((await app.request("/promotions/-1")).status).toBe(404);
  });
});
