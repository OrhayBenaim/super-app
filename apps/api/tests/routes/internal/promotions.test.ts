import { describe, expect, it } from "vitest";
import { prices, products, promotionItems, promotions, stores } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const TOKEN = "test-sync-token";
const NOW = new Date("2026-11-05T10:00:00Z"); // a Thursday in Israel (day 5)
const DAY = 86_400_000;
const RAMI = "7290058140886";
const SHUFERSAL = "7290027600007";
const TALPIOT = `${RAMI}-1`;
const AFULA = `${RAMI}-2`;
const HAIFA = `${RAMI}-3`;
const DIZENGOFF = `${SHUFERSAL}-1`;
const MILK = "7290000066318";
const BREAD = "7290000066325";
const UNKNOWN = "7290000099999"; // promoted, but no Product row and no price

const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }), { clock: fakeClock(NOW) });
const get = (deps: Deps, path: string, auth = `Bearer ${TOKEN}`) => createInternalApp(deps).request(path, { headers: { Authorization: auth } });

const promo = (storeId: string, promotionId: string, from: number, to: number, extra: Partial<typeof promotions.$inferInsert> = {}) => ({
  storeId, promotionId, description: `מבצע ${promotionId}`, kind: "bundle" as const, minQty: 2, amount: 10, audience: "club" as const,
  startsAt: new Date(NOW.getTime() + from * DAY), endsAt: new Date(NOW.getTime() + to * DAY), ...extra,
});

/**
 * Rami Levy publishes MILK2 at three stores, INFO at two, FRISAT (weekends) and FUTURE at one, ENDED at one; Shufersal
 * publishes its own Promotion with the same PromotionID MILK2 at one store.
 */
function seed(deps: Deps) {
  const store = (id: string, chainId: string, name: string, city: string) => ({ id, chainId, storeId: id.split("-")[1]!, subChainId: "1", name, address: "הרצל 1", city });
  deps.db
    .insert(stores)
    .values([
      store(TALPIOT, RAMI, "רמי לוי תלפיות", "ירושלים"),
      store(AFULA, RAMI, "רמי לוי עפולה", "עפולה"),
      store(HAIFA, RAMI, "רמי לוי חיפה", "חיפה"),
      store(DIZENGOFF, SHUFERSAL, "שופרסל דיזנגוף", "תל אביב"),
    ])
    .run();
  deps.db.insert(products).values([{ code: MILK, name: "חלב 3%" }, { code: BREAD, name: "לחם אחיד" }]).run();
  deps.db
    .insert(prices)
    .values([
      { storeId: TALPIOT, code: MILK, price: 6.9 },
      { storeId: AFULA, code: MILK, price: 6.5 },
      { storeId: HAIFA, code: BREAD, price: 7 },
      { storeId: DIZENGOFF, code: MILK, price: 5 }, // another Chain's: not this Promotion's cheapest
    ])
    .run();
  const ids = deps.db
    .insert(promotions)
    .values([
      promo(TALPIOT, "MILK2", -1, 1, { limitQty: 4 }),
      promo(AFULA, "MILK2", -1, 1, { limitQty: 4 }),
      promo(HAIFA, "MILK2", -1, 1, { limitQty: 4 }),
      promo(TALPIOT, "INFO", -1, 1, { kind: "info", minQty: 1, amount: 0, audience: "all" }),
      promo(AFULA, "INFO", -1, 1, { kind: "info", minQty: 1, amount: 0, audience: "all" }),
      promo(TALPIOT, "FRISAT", -1, 3, { days: "6,7", kind: "price", minQty: 1, amount: 5 }),
      promo(TALPIOT, "FUTURE", 1, 3),
      promo(HAIFA, "ENDED", -3, -1),
      promo(DIZENGOFF, "MILK2", -1, 1, { audience: "all" }),
    ])
    .returning({ id: promotions.id, storeId: promotions.storeId, promotionId: promotions.promotionId })
    .all();
  const id = (storeId: string, promotionId: string) => ids.find((r) => r.storeId === storeId && r.promotionId === promotionId)!.id;
  deps.db
    .insert(promotionItems)
    .values([
      ...[TALPIOT, AFULA, HAIFA].flatMap((s) => [MILK, BREAD, UNKNOWN].map((code) => ({ promotionId: id(s, "MILK2"), code }))),
      { promotionId: id(HAIFA, "ENDED"), code: MILK },
      { promotionId: id(DIZENGOFF, "MILK2"), code: MILK },
    ])
    .run();
  return id;
}

type Row = { id: number; chainId: string; chainName: string; promotionId: string; kind: string; state: string; deal: string; stores: number; products: number };
type List = {
  promotions: Row[];
  total: number;
  page: number;
  pageSize: number;
  counts: { running: number; future: number; ended: number };
  info: number;
  stores: number;
  storeOptions: { id: string; name: string }[];
};
const list = async (deps: Deps, query = "") => {
  const res = await get(deps, `/promotions${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as List;
};
const keys = (l: List) => l.promotions.map((p) => `${p.chainName} ${p.promotionId}`);

describe("GET /promotions (private)", () => {
  it("lists one row per Promotion of a Chain across its stores, running ones, most stores first, with the counts of each state", async () => {
    const deps = setup();
    const id = seed(deps);
    const body = await list(deps);
    // FRISAT is within its dates but not on today's weekday: listed under running, its state not today (as its page says)
    expect(keys(body)).toEqual(["Rami Levy MILK2", "Rami Levy INFO", "Rami Levy FRISAT", "Shufersal MILK2"]);
    expect(body.promotions.map((p) => [p.promotionId, p.state, p.deal])).toEqual([
      ["MILK2", "running", "2 ב-₪10"],
      ["INFO", "running", "מבצע INFO"],
      ["FRISAT", "notToday", "₪5"],
      ["MILK2", "running", "2 ב-₪10"],
    ]);
    expect(body.promotions[0]).toEqual({
      id: id(TALPIOT, "MILK2"),
      chainId: RAMI,
      chainName: "Rami Levy",
      promotionId: "MILK2",
      description: "מבצע MILK2",
      kind: "bundle",
      minQty: 2,
      amount: 10,
      audience: "club",
      startsAt: "2026-11-04T10:00:00.000Z",
      endsAt: "2026-11-06T10:00:00.000Z",
      days: null,
      limitQty: 4,
      minPurchase: null,
      state: "running",
      deal: "2 ב-₪10",
      stores: 3,
      products: 3,
    });
    expect(body).toMatchObject({ total: 4, page: 1, counts: { running: 4, future: 1, ended: 1 }, info: 1, stores: 4, chain: null });
    expect(body.storeOptions.map((s) => s.id)).toEqual([HAIFA, AFULA, TALPIOT, DIZENGOFF]);
  });

  it("filters by Chain, by kind and by state", async () => {
    const deps = setup();
    seed(deps);
    const rami = await list(deps, `?chain=${RAMI}`);
    expect(keys(rami)).toEqual(["Rami Levy MILK2", "Rami Levy INFO", "Rami Levy FRISAT"]);
    expect(rami).toMatchObject({ counts: { running: 3, future: 1, ended: 1 }, stores: 3 });
    expect(rami.storeOptions.map((s) => s.id)).toEqual([HAIFA, AFULA, TALPIOT]);
    expect(keys(await list(deps, "?kind=info"))).toEqual(["Rami Levy INFO"]);
    expect(keys(await list(deps, "?state=future"))).toEqual(["Rami Levy FUTURE"]);
    expect(keys(await list(deps, "?state=ended"))).toEqual(["Rami Levy ENDED"]);
  });

  it("a store's Promotions, each still counting every store of its Chain that publishes it", async () => {
    const deps = setup();
    seed(deps);
    const body = await list(deps, `?store=${AFULA}`);
    expect(body.promotions.map((p) => [p.promotionId, p.stores])).toEqual([
      ["MILK2", 3],
      ["INFO", 2],
    ]);
    expect(body).toMatchObject({ counts: { running: 2, future: 0, ended: 0 }, chain: RAMI });
    expect(body.storeOptions.map((s) => s.id)).toEqual([HAIFA, AFULA, TALPIOT]); // its Chain's
  });

  it("pages the list", async () => {
    const deps = setup();
    seed(deps);
    expect(await list(deps, "?page=2")).toMatchObject({ promotions: [], total: 4, page: 2 });
  });

  it("400 for a kind, state or page it does not know, 404 for an unknown store", async () => {
    const deps = setup();
    seed(deps);
    for (const q of ["?kind=free", "?state=today", "?page=0", `?store=${"1".repeat(65)}`]) expect((await get(deps, `/promotions${q}`)).status).toBe(400);
    expect((await get(deps, "/promotions?store=nope")).status).toBe(404);
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    expect((await createInternalApp(deps).request("/promotions")).status).toBe(401);
    expect((await get(deps, "/promotions", "Bearer wrong")).status).toBe(401);
  });
});

type Detail = {
  promotion: { promotionId: string; chainName: string; state: string; deal: string; combines: boolean };
  stores: { id: string; name: string; city: string }[];
  products: { code: string; name: string | null; price: number | null; promotion: { price: number; saving: number } | null }[];
};

describe("GET /promotions/:id (private)", () => {
  it("returns the Promotion across its Chain's stores: its terms, the stores, and each Product at the cheapest of them", async () => {
    const deps = setup();
    const id = seed(deps);
    const res = await get(deps, `/promotions/${id(AFULA, "MILK2")}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Detail;
    expect(body.promotion).toMatchObject({ promotionId: "MILK2", chainName: "Rami Levy", state: "running", deal: "2 ב-₪10", minQty: 2, amount: 10, limitQty: 4, combines: true });
    expect(body.stores).toEqual([
      { id: HAIFA, name: "רמי לוי חיפה", city: "חיפה" },
      { id: AFULA, name: "רמי לוי עפולה", city: "עפולה" },
      { id: TALPIOT, name: "רמי לוי תלפיות", city: "ירושלים" },
    ]);
    // 2 for ₪10 is ₪5 each; milk is cheapest at Afula (Shufersal's ₪5 is another Chain's), bread only Haifa prices
    expect(body.products).toEqual([
      { code: MILK, name: "חלב 3%", price: 6.5, promotion: { price: 5, saving: 23 } },
      { code: BREAD, name: "לחם אחיד", price: 7, promotion: { price: 5, saving: 29 } },
      { code: UNKNOWN, name: null, price: null, promotion: null },
    ]);
  });

  it("marks a Promotion within its dates but not on today's weekday as not today", async () => {
    const deps = setup();
    const id = seed(deps);
    const body = (await (await get(deps, `/promotions/${id(TALPIOT, "FRISAT")}`)).json()) as Detail;
    expect(body.promotion.state).toBe("notToday");
  });

  it("400 for a bad id, 404 for an unknown one", async () => {
    const deps = setup();
    seed(deps);
    expect((await get(deps, "/promotions/abc")).status).toBe(400);
    expect((await get(deps, "/promotions/99999")).status).toBe(404);
  });

  it("401 without the token", async () => {
    expect((await createInternalApp(setup()).request("/promotions/1")).status).toBe(401);
  });
});
