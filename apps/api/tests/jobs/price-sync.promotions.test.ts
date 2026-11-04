import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";
import type { PricePortal } from "#/services/price-portal.ts";
import { fakeClock } from "#/utils/clock.ts";

const fx = (f: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../__fixtures__/${f}`, import.meta.url))));
const OSHER = "7290103152017";
const [MILK, BREAD, EGGS] = ["7290000000001", "7290000000002", "7290000000003"];
// Store 1 in the PriceFull fixture: milk 6.00, bread 7.00, eggs 12.00. Store 2: milk 5.50, eggs 11.00.
const base = {
  [`Stores${OSHER}-000-20261021-080500.xml`]: fx(`Stores${OSHER}-000-20261021-080500.xml`),
  [`PriceFull${OSHER}-001-001-20261021-051600.gz`]: fx(`PriceFull${OSHER}-001-001-20261021-051600.gz`),
  [`PriceFull${OSHER}-001-002-20261021-051600.xml`]: fx(`PriceFull${OSHER}-001-002-20261021-051600.xml`),
};

type Promo = { id: string; code: string; price: number };
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-10-21T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>מבצע ${p.id}</PromotionDescription><PromotionStartDateTime>2026-10-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-10-31T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays /><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems><PromotionItem><ItemCode>${p.code}</ItemCode><ItemType>1</ItemType><RewardType>3</RewardType><MinQty>1.00</MinQty><MaxQty></MaxQty><DiscountRate></DiscountRate><DiscountedPrice>${p.price.toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${p.price.toFixed(2)}</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem></PromotionItems></Group></Groups></Promotion>`;
const promoFile = (promos: Promo[], store = "001") =>
  new TextEncoder().encode(
    `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`,
  );
const full = (ts: string, store = "001") => `PromoFull${OSHER}-001-${store}-${ts}.xml`;
const upd = (ts: string, store = "001") => `Promo${OSHER}-001-${store}-${ts}.xml`;
const html = new TextEncoder().encode("<html><body>please log in</body></html>");
const milk = (id: string, price: number): Promo => ({ id, code: MILK, price });
const bread = (id: string, price: number): Promo => ({ id, code: BREAD, price });
const eggs = (id: string, price: number): Promo => ({ id, code: EGGS, price });

type Line = { code: string; price: number; lineTotal: number; promotion?: { id: string; amount: number } };
const sku = (c: string) => `${OSHER}:${c}`;

/** A portal whose files can be swapped between syncs. */
function swappable(files: Record<string, Uint8Array>, rejects: string[] = []) {
  const state = { files: { ...base, ...files } };
  const portal: PricePortal = {
    async open() {
      const session = await fakePricePortal(state.files).open();
      return { ...session, download: (f) => (rejects.includes(f.name) ? Promise.reject(new Error("timeout")) : session.download(f)) };
    },
  };
  return { state, portal };
}

async function world(portal: PricePortal) {
  const deps: Deps = buildDeps(loadConfig(), {
    pricePortal: portal,
    geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })),
    clock: fakeClock(new Date("2026-10-21T12:00:00+03:00")), // a Wednesday
    errorHandler: fakeErrorHandler(),
  });
  const app = createApp(deps);
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dana@promos.test", password: "password1234", name: "Dana" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const sync = async () => {
    const id = await priceSyncJob(deps)({});
    return deps.db.$client
      .prepare("SELECT status, error, promotions_loaded, promotion_status, promotion_error FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?")
      .get(id, OSHER) as { status: string; error: string | null; promotions_loaded: number; promotion_status: string; promotion_error: string | null };
  };
  /** Each store's lines by product code, keyed by store number. */
  const compare = async () => {
    const res = await app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ lat: 32, lng: 34, items: [MILK, BREAD, EGGS].map((c) => ({ code: sku(c), quantity: 1 })) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: { storeId: string; items: Line[] }[] };
    return Object.fromEntries(body.stores.map((s) => [s.storeId.split("-")[1], Object.fromEntries(s.items.map((i) => [i.code.split(":")[1], i]))])) as Record<string, Record<string, Line>>;
  };
  return { sync, compare };
}

describe("priceSyncJob Promotions", () => {
  it("loads the newest PromoFull and the newest Promo update after it, nothing older", async () => {
    const { portal } = swappable({
      [full("20261021-040000")]: promoFile([eggs("9", 1)]), // older PromoFull: not loaded
      [full("20261021-051700")]: promoFile([milk("1", 5), bread("2", 6)]),
      [upd("20261021-040000")]: promoFile([bread("2", 0.5)]), // older than the full file
      [upd("20261021-060000")]: promoFile([milk("1", 4.5), eggs("3", 10)]), // older update
      [upd("20261021-120000")]: promoFile([milk("1", 4)]),
    });
    const w = await world(portal);
    const result = await w.sync();
    expect(result).toMatchObject({ status: "ok", promotion_status: "ok", promotion_error: null });
    expect(result.promotions_loaded).toBeGreaterThan(0);
    const s1 = (await w.compare())["1"]!;
    expect(s1[MILK]).toMatchObject({ price: 6, lineTotal: 4, promotion: { id: "1", amount: 4 } });
    expect(s1[BREAD]).toMatchObject({ lineTotal: 6, promotion: { id: "2" } });
    expect(s1[EGGS]).toMatchObject({ lineTotal: 12 });
    expect(s1[EGGS]).not.toHaveProperty("promotion");
  });

  it("a store whose promotion file cannot be loaded keeps the Promotions from before while another store's loads", async () => {
    const files: Record<string, Uint8Array> = {
      [full("20261021-051700", "001")]: promoFile([milk("1", 5)]),
      [full("20261021-051700", "002")]: promoFile([milk("5", 4.5)], "002"),
    };
    const { state, portal } = swappable(files);
    const w = await world(portal);
    await w.sync();
    state.files = {
      ...state.files,
      [full("20261021-070000", "001")]: promoFile([milk("1", 5.25)]),
      [full("20261021-070000", "002")]: html,
    };
    const second = await w.sync();
    expect(second).toMatchObject({ status: "ok", promotion_status: "ok" });
    const lines = await w.compare();
    expect(lines["1"]![MILK]).toMatchObject({ lineTotal: 5.25, promotion: { id: "1" } });
    expect(lines["2"]![MILK]).toMatchObject({ lineTotal: 4.5, promotion: { id: "5" } });
  });

  it("every promotion file of the Chain failing fails the promotions only: prices still update", async () => {
    const { portal } = swappable({
      [full("20261021-051700", "001")]: html,
      [full("20261021-051700", "002")]: new TextEncoder().encode("<Root><Promotions><Promotion>"),
    });
    const w = await world(portal);
    const result = await w.sync();
    expect(result).toMatchObject({ status: "ok", error: null, promotion_status: "failed", promotions_loaded: 0 });
    expect(typeof result.promotion_error).toBe("string");
    expect(result.promotion_error!.length).toBeGreaterThan(0);
    const lines = await w.compare();
    expect(lines["1"]![MILK]).toMatchObject({ price: 6, lineTotal: 6 });
    expect(lines["2"]![MILK]).toMatchObject({ price: 5.5, lineTotal: 5.5 });
    expect(lines["1"]![MILK]).not.toHaveProperty("promotion");
  });

  it("every promotion download rejecting also fails the promotions only", async () => {
    const names = [full("20261021-051700", "001"), full("20261021-051700", "002")];
    const { portal } = swappable({ [names[0]!]: promoFile([milk("1", 5)]), [names[1]!]: promoFile([milk("5", 4.5)], "002") }, names);
    const w = await world(portal);
    expect(await w.sync()).toMatchObject({ status: "ok", promotion_status: "failed" });
    expect((await w.compare())["1"]![MILK]).toMatchObject({ lineTotal: 6 });
  });

  it.each([
    ["is an HTML page", html, []],
    ["download rejects", promoFile([milk("1", 1)]), [upd("20261021-120000")]],
  ])("an update file that fails (%s) leaves the store on its PromoFull's Promotions", async (_why, bytes, rejects) => {
    const { portal } = swappable({ [full("20261021-051700")]: promoFile([milk("1", 5)]), [upd("20261021-120000")]: bytes }, rejects);
    const w = await world(portal);
    const result = await w.sync();
    expect(result).toMatchObject({ status: "ok", promotion_status: "ok", promotion_error: null });
    expect((await w.compare())["1"]![MILK]).toMatchObject({ lineTotal: 5, promotion: { id: "1", amount: 5 } });
  });

  it("a Chain listing no promotion files is promotion_status ok with nothing loaded", async () => {
    const w = await world(swappable({}).portal);
    expect(await w.sync()).toMatchObject({ status: "ok", promotion_status: "ok", promotions_loaded: 0, promotion_error: null });
    expect((await w.compare())["1"]![MILK]).toMatchObject({ lineTotal: 6 });
  });

  it("a Promotion the next sync's PromoFull no longer lists has ended", async () => {
    const { state, portal } = swappable({ [full("20261021-051700")]: promoFile([milk("1", 5), bread("2", 6)]) });
    const w = await world(portal);
    await w.sync();
    state.files = { ...state.files, [full("20261021-080000")]: promoFile([bread("2", 6)]) };
    expect(await w.sync()).toMatchObject({ promotion_status: "ok" });
    const s1 = (await w.compare())["1"]!;
    expect(s1[MILK]).toMatchObject({ price: 6, lineTotal: 6 });
    expect(s1[MILK]).not.toHaveProperty("promotion");
    expect(s1[BREAD]).toMatchObject({ lineTotal: 6, promotion: { id: "2" } });
  });
});
