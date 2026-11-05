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
const STORE = `${RAMI}-1`;
const MILK = "7290000066318";
const BREAD = "7290000066325";
const UNKNOWN = "7290000099999"; // promoted, but no Product row and no price

const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }), { clock: fakeClock(NOW) });
const get = (deps: Deps, path: string, auth = `Bearer ${TOKEN}`) => createInternalApp(deps).request(path, { headers: { Authorization: auth } });

const promo = (promotionId: string, from: number, to: number, extra: Partial<typeof promotions.$inferInsert> = {}) => ({
  storeId: STORE, promotionId, description: `מבצע ${promotionId}`, kind: "bundle" as const, minQty: 2, amount: 10, audience: "club" as const,
  startsAt: new Date(NOW.getTime() + from * DAY), endsAt: new Date(NOW.getTime() + to * DAY), ...extra,
});

/** One store with a running, an ended, a future, a not-today and an information-only Promotion. */
function seed(deps: Deps) {
  const store = (storeId: string, name: string) => ({ id: `${RAMI}-${storeId}`, chainId: RAMI, storeId, subChainId: "1", name, address: "הרצל 1", city: "חיפה", lat: null, lng: null });
  deps.db.insert(stores).values([store("1", "רמי לוי תלפיות"), store("2", "רמי לוי עפולה")]).run();
  deps.db.insert(products).values([{ code: MILK, name: "חלב 3%" }, { code: BREAD, name: "לחם אחיד" }]).run();
  deps.db.insert(prices).values([{ storeId: STORE, code: MILK, price: 6.9 }, { storeId: `${RAMI}-2`, code: BREAD, price: 7 }]).run();
  const ids = deps.db
    .insert(promotions)
    .values([
      promo("ENDED", -3, -1),
      promo("RUNNING", -1, 1, { limitQty: 4, minPurchase: 100 }),
      promo("FUTURE", 1, 3),
      promo("FRISAT", -1, 3, { days: "6,7" }),
      promo("INFO", -1, 1, { kind: "info", minQty: 1, amount: 0, audience: "all", days: "5" }),
      { ...promo("OTHER", -1, 1), storeId: `${RAMI}-2` },
    ])
    .returning({ id: promotions.id, promotionId: promotions.promotionId })
    .all();
  const id = (p: string) => ids.find((r) => r.promotionId === p)!.id;
  deps.db
    .insert(promotionItems)
    .values([
      { promotionId: id("RUNNING"), code: MILK },
      { promotionId: id("RUNNING"), code: BREAD },
      { promotionId: id("RUNNING"), code: UNKNOWN },
      { promotionId: id("ENDED"), code: MILK },
    ])
    .run();
  return id;
}

type List = { store: { id: string; name: string; chainName: string }; promotions: { promotionId: string; state: string; itemCount: number }[] };

describe("GET /promotions?store= (private)", () => {
  it("lists the store's Promotions, running first, each marked running, not today, future or ended as Compare decides", async () => {
    const deps = setup();
    const id = seed(deps);
    const res = await get(deps, `/promotions?store=${STORE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as List;
    expect(body.store).toEqual({ id: STORE, name: "רמי לוי תלפיות", chainName: "Rami Levy" });
    expect(body.promotions.map((p) => [p.promotionId, p.state])).toEqual([
      ["RUNNING", "running"],
      ["INFO", "running"],
      ["FRISAT", "notToday"],
      ["FUTURE", "future"],
      ["ENDED", "ended"],
    ]);
    expect(body.promotions[0]).toEqual({
      id: id("RUNNING"),
      storeId: STORE,
      promotionId: "RUNNING",
      description: "מבצע RUNNING",
      kind: "bundle",
      minQty: 2,
      amount: 10,
      audience: "club",
      startsAt: "2026-11-04T10:00:00.000Z",
      endsAt: "2026-11-06T10:00:00.000Z",
      days: null,
      limitQty: 4,
      minPurchase: 100,
      itemCount: 3,
      state: "running",
    });
  });

  it("a day later the running one has ended and the future one runs", async () => {
    const deps = setup();
    seed(deps);
    (deps.clock as ReturnType<typeof fakeClock>).advance(DAY);
    const body = (await (await get(deps, `/promotions?store=${STORE}`)).json()) as List;
    expect(body.promotions.find((p) => p.promotionId === "RUNNING")?.state).toBe("ended");
    expect(body.promotions.find((p) => p.promotionId === "FUTURE")?.state).toBe("running");
  });

  it("400 without a store, 404 for an unknown one", async () => {
    const deps = setup();
    expect((await get(deps, "/promotions")).status).toBe(400);
    expect((await get(deps, "/promotions?store=nope")).status).toBe(404);
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    expect((await createInternalApp(deps).request(`/promotions?store=${STORE}`)).status).toBe(401);
    expect((await get(deps, `/promotions?store=${STORE}`, "Bearer wrong")).status).toBe(401);
  });
});

describe("GET /promotions/:id (private)", () => {
  it("returns the Promotion with its store and its Products, each with its Shelf price at that store", async () => {
    const deps = setup();
    const id = seed(deps);
    const res = await get(deps, `/promotions/${id("RUNNING")}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { promotion: { promotionId: string; state: string }; store: unknown; products: unknown };
    expect(body.promotion).toMatchObject({ promotionId: "RUNNING", state: "running", itemCount: 3 });
    expect(body.store).toEqual({ id: STORE, name: "רמי לוי תלפיות", chainName: "Rami Levy" });
    expect(body.products).toEqual([
      { code: MILK, name: "חלב 3%", price: 6.9 },
      { code: BREAD, name: "לחם אחיד", price: null },
      { code: UNKNOWN, name: null, price: null },
    ]);
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
