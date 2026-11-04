import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const real = (dir: string, name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../__fixtures__/real/promos/${dir}/${name}`, import.meta.url))));
const text = (s: string) => new TextEncoder().encode(s);
const KESHET = "7290785400000";
const YOHANANOF = "7290803800003";
const storesFile = (chain: string, store: string) =>
  text(`<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>${store}</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`);

type Line = { lineTotal: number; promotion?: { id: string } };

async function world(files: Record<string, Uint8Array>, chainId: string) {
  const errorHandler = fakeErrorHandler();
  const portal = fakePricePortal(files);
  const deps = buildDeps(loadConfig(), {
    pricePortal: portal,
    geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })),
    clock: fakeClock(new Date("2026-11-05T10:00:00+02:00")), // a Thursday
    errorHandler,
  });
  const app = createApp(deps);
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dana@layouts.test", password: "password1234", name: "Dana" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const sync = async () => {
    const id = await priceSyncJob(deps)({});
    return deps.db.$client
      .prepare("SELECT status, promotions_loaded, promotion_status, promotion_error FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?")
      .get(id, chainId) as { status: string; promotions_loaded: number; promotion_status: string; promotion_error: string | null };
  };
  const line = async (code: string, quantity: number) => {
    const res = await app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ lat: 32, lng: 34, items: [{ code, quantity }] }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: { items: Line[] }[] }).stores[0]!.items[0]!;
  };
  return { sync, line, errorHandler, portal };
}

describe("priceSyncJob with the other promotion layouts", () => {
  it("loads Keshet's flat store: Promotions loaded, promotion_status ok, no unknown-layout file in the warning", async () => {
    const w = await world(
      {
        [`Stores${KESHET}-000-20261104-000000.xml`]: storesFile(KESHET, "2"),
        [`PriceFull${KESHET}-002-202611040010.gz`]: real("keshet", `PriceFull${KESHET}-002-202611040010.gz`),
        [`PromoFull${KESHET}-002-202611040011.gz`]: real("keshet", `PromoFull${KESHET}-002-202611040011.gz`),
        [`Promo${KESHET}-002-202611041400.gz`]: real("keshet", `Promo${KESHET}-002-202611041400.gz`),
      },
      KESHET,
    );
    const result = await w.sync();
    expect(result).toMatchObject({ status: "ok", promotion_status: "ok", promotion_error: null });
    expect(result.promotions_loaded).toBeGreaterThan(0);
    const warning = w.errorHandler.warnings.find((x) => x.message.includes("keshet"));
    expect((warning?.details as { unknownLayout?: string[] } | undefined)?.unknownLayout ?? []).toEqual([]);
    expect(await w.line("4770166219535", 3)).toMatchObject({ lineTotal: 15.9, promotion: { id: "17659" } });
  });

  it("ignores Yohananof's stale PromoFull0000000000000 file: it is never downloaded and its Promotions never reach Compare", async () => {
    const stale = "PromoFull0000000000000-00-1-202602060505.gz";
    // A grouped file that would drop the code to 1 shekel if it were loaded.
    const staleXml = text(
      `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${YOHANANOF}</ChainID><SubChainID>000</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions><Promotion><PromotionID>9999</PromotionID><PromotionDescription>stale</PromotionDescription><PromotionStartDateTime>2026-01-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2027-01-01T00:00:00.000</PromotionEndDateTime><PromotionDays></PromotionDays><ClubID>0 - כלל הלקוחות</ClubID><AdditionalIsCoupon>0</AdditionalIsCoupon><Groups><Group><GroupID>1</GroupID><PromotionItems><PromotionItem><ItemCode>3574661487328</ItemCode><ItemType>1</ItemType><RewardType>3</RewardType><MinQty>1.00</MinQty><DiscountedPrice>1.00</DiscountedPrice><bIsWeighted>0</bIsWeighted></PromotionItem></PromotionItems></Group></Groups></Promotion></Promotions></Root>`,
    );
    const w = await world(
      {
        [`Stores${YOHANANOF}-000-20261104-000000.xml`]: storesFile(YOHANANOF, "1"),
        [`PriceFull${YOHANANOF}-000-001-20261104-004032.gz`]: real("yohananof", `PriceFull${YOHANANOF}-000-001-20261104-004032.gz`),
        [`PromoFull${YOHANANOF}-000-001-20261104-004032.gz`]: real("yohananof", `PromoFull${YOHANANOF}-000-001-20261104-004032.gz`),
        [stale]: staleXml,
      },
      YOHANANOF,
    );
    expect(await w.sync()).toMatchObject({ status: "ok", promotion_status: "ok", promotion_error: null });
    expect(w.portal.downloaded).not.toContain(stale);
    expect(await w.line("3574661487328", 2)).toMatchObject({ lineTotal: 25, promotion: { id: "364839" } });
  });
});
