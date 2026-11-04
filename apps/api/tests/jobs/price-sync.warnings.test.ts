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

/** reward 3 with a price is priced; 2 with rate 100 (a gift), 3 at price 0 and 11 are not. */
type Promo = { id: string; code: string; reward?: 2 | 3 | 11; price?: number; rate?: number; desc?: string; weighted?: { minQty: string } };
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-10-21T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>${p.desc ?? `מבצע ${p.id}`}</PromotionDescription><PromotionStartDateTime>2026-10-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-10-31T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays /><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems><PromotionItem><ItemCode>${p.code}</ItemCode><ItemType>1</ItemType><RewardType>${p.reward ?? 3}</RewardType><MinQty>${p.weighted?.minQty ?? "1.00"}</MinQty><MaxQty></MaxQty><DiscountRate>${p.rate ?? ""}</DiscountRate><DiscountedPrice>${(p.price ?? 0).toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${(p.price ?? 0).toFixed(2)}</DiscountedPricePerMida><bIsWeighted>${p.weighted ? 1 : 0}</bIsWeighted></PromotionItem></PromotionItems></Group></Groups></Promotion>`;
const promoFile = (promos: Promo[], store = "001") =>
  new TextEncoder().encode(
    `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`,
  );
// A layout no Chain publishes: Promotions with neither Groups nor PromotionItems.
const unknownFile = (store = "001") =>
  new TextEncoder().encode(
    `<Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><Promotions><Promotion><PromotionID>77</PromotionID><Products><Product><Code>${MILK}</Code></Product></Products></Promotion></Promotions></Root>`,
  );
const full = (ts: string, store = "001") => `PromoFull${OSHER}-001-${store}-${ts}.xml`;
const upd = (ts: string, store = "001") => `Promo${OSHER}-001-${store}-${ts}.xml`;
const priced = (id: string, code: string, price: number): Promo => ({ id, code, price });
const gift = (id: string, code: string, desc?: string): Promo => ({ id, code, reward: 2, rate: 100, desc });

type Line = { code: string; lineTotal: number; promotion?: { id: string }; info?: { id: string; description: string }[] };
const sku = (c: string) => `${OSHER}:${c}`;

/** A portal whose files can be swapped between syncs. */
function swappable(files: Record<string, Uint8Array>) {
  const state = { files: { ...base, ...files } };
  const portal: PricePortal = { open: () => fakePricePortal(state.files).open() };
  return { state, portal };
}

async function world(portal: PricePortal) {
  const errorHandler = fakeErrorHandler();
  const deps: Deps = buildDeps(loadConfig(), {
    pricePortal: portal,
    geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })),
    clock: fakeClock(new Date("2026-10-21T12:00:00+03:00")), // a Wednesday
    errorHandler,
  });
  const app = createApp(deps);
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dana@warnings.test", password: "password1234", name: "Dana" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const sync = async () => {
    const id = await priceSyncJob(deps)({});
    return deps.db.$client
      .prepare("SELECT status, error, promotions_loaded, promotion_status, promotion_error FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?")
      .get(id, OSHER) as { status: string; error: string | null; promotions_loaded: number; promotion_status: string; promotion_error: string | null };
  };
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
  /** The one warning's details, with the store lists sorted. */
  const details = () => {
    const [w] = errorHandler.warnings;
    const d = w!.details as { unpriced: Record<string, Record<string, string[]>>; unknownLayout: string[] };
    return {
      unpriced: Object.fromEntries(Object.entries(d.unpriced).map(([k, byId]) => [k, Object.fromEntries(Object.entries(byId).map(([id, stores]) => [id, [...stores].sort()]))])),
      unknownLayout: [...d.unknownLayout].sort(),
    };
  };
  return { sync, compare, errorHandler, details };
}

describe("priceSyncJob warnings and information-only Promotions", () => {
  it("an unknown-layout PromoFull keeps the store's Promotions, never fails the Promotions, and is listed in one warning", async () => {
    const { state, portal } = swappable({ [full("20261021-051700")]: promoFile([priced("1", MILK, 5)]) });
    const w = await world(portal);
    await w.sync();
    expect(w.errorHandler.warnings).toHaveLength(0);
    state.files = { ...state.files, [full("20261021-070000")]: unknownFile() };
    const second = await w.sync();
    expect(second).toMatchObject({ status: "ok", promotion_status: "ok", promotion_error: null });
    expect((await w.compare())["1"]![MILK]).toMatchObject({ lineTotal: 5, promotion: { id: "1" } });
    expect(w.errorHandler.warnings).toHaveLength(1);
    expect(w.errorHandler.warnings[0]!.message).toContain("osher-ad");
    expect(w.details()).toEqual({ unpriced: {}, unknownLayout: [full("20261021-070000")] });
    expect(w.errorHandler.reported.map(String).filter((e) => !e.includes("no Stores file"))).toEqual([]); // only the other Chains, which the fake portal lists nothing for
  });

  it("an unknown-layout file as the Chain's only promotion file is still promotion_status ok", async () => {
    const w = await world(swappable({ [full("20261021-051700")]: unknownFile() }).portal);
    expect(await w.sync()).toMatchObject({ status: "ok", promotion_status: "ok", promotion_error: null });
    expect(w.details()).toEqual({ unpriced: {}, unknownLayout: [full("20261021-051700")] });
  });

  it("an unknown-layout Promo update file is listed too, and the PromoFull's Promotions stay", async () => {
    const { portal } = swappable({ [full("20261021-051700")]: promoFile([priced("1", MILK, 5)]), [upd("20261021-120000")]: unknownFile() });
    const w = await world(portal);
    expect(await w.sync()).toMatchObject({ promotion_status: "ok", promotion_error: null });
    expect((await w.compare())["1"]![MILK]).toMatchObject({ lineTotal: 5, promotion: { id: "1" } });
    expect(w.errorHandler.warnings).toHaveLength(1);
    expect(w.details()).toEqual({ unpriced: {}, unknownLayout: [upd("20261021-120000")] });
  });

  it("Promotions Grocer cannot price are listed once per Chain by kind, Promotion and store, never the priced ones", async () => {
    const { portal } = swappable({
      [full("20261021-051700", "001")]: promoFile([gift("5", MILK), { id: "6", code: BREAD, reward: 11 }, priced("7", EGGS, 10)]),
      [full("20261021-051700", "002")]: promoFile([gift("5", MILK), { id: "8", code: EGGS, reward: 3, price: 0 }], "002"),
      [upd("20261021-120000", "001")]: promoFile([gift("5", MILK)]), // seen in both files of store 1: listed once
      [upd("20261021-120000", "002")]: promoFile([{ id: "8", code: EGGS, reward: 3, price: 0 }], "002"),
    });
    const w = await world(portal);
    expect(await w.sync()).toMatchObject({ status: "ok", promotion_status: "ok" });
    expect(w.errorHandler.warnings).toHaveLength(1);
    expect(w.errorHandler.warnings[0]!.message).toContain("osher-ad");
    expect(w.details()).toEqual({
      unpriced: {
        "RewardType 2": { "5": ["1", "2"] },
        "RewardType 11": { "6": ["1"] },
        "RewardType 3": { "8": ["2"] },
      },
      unknownLayout: [],
    });
    expect(w.errorHandler.reported.map(String).filter((e) => !e.includes("no Stores file"))).toEqual([]); // only the other Chains, which the fake portal lists nothing for
  });

  it("weighted Promotions are listed only when per kilo or per pack is unclear", async () => {
    const { portal } = swappable({
      [full("20261021-051700")]: promoFile([
        { id: "11", code: MILK, price: 5, weighted: { minQty: "0.01" } }, // per kilo: priced
        { id: "12", code: BREAD, price: 20, weighted: { minQty: "200" } }, // unclear: info-only
      ]),
    });
    const w = await world(portal);
    await w.sync();
    expect(w.details()).toEqual({ unpriced: { "weighted MinQty 200: per kilo or per pack unclear": { "12": ["1"] } }, unknownLayout: [] });
  });

  it("a sync with only priced Promotions in known layouts sends no warning", async () => {
    const { portal } = swappable({
      [full("20261021-051700")]: promoFile([priced("1", MILK, 5), priced("2", BREAD, 6)]),
      [upd("20261021-120000")]: promoFile([priced("1", MILK, 4)]),
    });
    const w = await world(portal);
    await w.sync();
    expect(w.errorHandler.warnings).toHaveLength(0);
  });

  it("a Chain with no promotion files sends no warning", async () => {
    const w = await world(swappable({}).portal);
    await w.sync();
    expect(w.errorHandler.warnings).toHaveLength(0);
  });

  it("information-only Promotions loaded by the sync show in Compare and count as loaded", async () => {
    const { portal } = swappable({
      [full("20261021-051700")]: promoFile([priced("1", MILK, 5), gift("0009", BREAD, "לחם מתנה בקניית חלב")]),
    });
    const w = await world(portal);
    const result = await w.sync();
    expect(result).toMatchObject({ promotion_status: "ok", promotions_loaded: 2 });
    const s1 = (await w.compare())["1"]!;
    expect(s1[BREAD]).toMatchObject({ lineTotal: 7, info: [{ id: "9", description: "לחם מתנה בקניית חלב" }] });
    expect(s1[BREAD]).not.toHaveProperty("promotion");
    expect(s1[MILK]).toMatchObject({ lineTotal: 5, promotion: { id: "1" } });
    expect(s1[MILK]).not.toHaveProperty("info");
    expect(w.details()).toEqual({ unpriced: { "RewardType 2": { "9": ["1"] } }, unknownLayout: [] });
  });
});
