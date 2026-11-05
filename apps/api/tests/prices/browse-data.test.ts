import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { ingestPromotions, ingestStores } from "#/ingest/ingest.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { refreshBrowse } from "#/prices/browse-groups.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const here = { lat: 32.0853, lng: 34.7818 };
const enc = (s: string) => new TextEncoder().encode(s);
const storesXml = `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>001</SubChainID><Stores>${[1, 2]
  .map((n) => `<Store><StoreID>${n}</StoreID><StoreName>near ${n}</StoreName><Address>רחוב ${n}</Address><City>תל אביב</City></Store>`)
  .join("")}</Stores></SubChain></SubChains></Root>`;
const milkXml = (price: number) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>1</StoreID><Items Count="1"><Item><PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>1</ItemCode><ItemType>1</ItemType><ItemName>חלב תנובה 3% 1 ליטר</ItemName><ManufacturerName></ManufacturerName><UnitQty>ליטר</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice><ItemStatus>1</ItemStatus></Item></Items></Root>`;
const promosXml = (store: number, ids: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${store}</StoreID><BikoretNo>0</BikoretNo><Promotions>${ids
    .map(
      (id) =>
        `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${id}</PromotionID><PromotionDescription>מבצע ${id}</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-11-30T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays></PromotionDays><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>0 - כלל הלקוחות</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems><PromotionItem><ItemCode>1</ItemCode><ItemType>1</ItemType><RewardType>3</RewardType><MinQty>1.00</MinQty><MaxQty></MaxQty><DiscountRate></DiscountRate><DiscountedPrice>4.90</DiscountedPrice><DiscountedPricePerMida>4.90</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem></PromotionItems></Group></Groups></Promotion>`,
    )
    .join("")}</Promotions></Root>`;

/** Osher Ad's stores "near 1" and "near 2" at `here`, store 1 pricing milk at `price`, after one Price sync. */
async function world(price: number) {
  const files: Record<string, Uint8Array> = {
    [`Stores${OSHER}-000-20261021-080500.xml`]: enc(storesXml),
    [`PriceFull${OSHER}-001-001-20261021-051600.xml`]: enc(milkXml(price)),
  };
  const deps = buildDeps(loadConfig(), { pricePortal: fakePricePortal(files), geocoder: fakeGeocoder(() => here) });
  await priceSyncJob(deps)({});
  const app = createApp(deps);
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "copy@browse.test", password: "password1234", name: "Cody" }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const milkPrice = async () => {
    const cards = (await (await app.request(`/api/browse/types/other?lat=${here.lat}&lng=${here.lng}`, { headers: { cookie } })).json()) as { minPrice: number }[];
    return cards[0]?.minPrice;
  };
  return { deps, files, milkPrice };
}

const count = (deps: Deps, table: string) => deps.db.$client.prepare(`SELECT count(*) FROM ${table}`).pluck().get();

describe("browse's copy of the price data", () => {
  it("shows a Price sync's new prices on the next request", async () => {
    const { deps, files, milkPrice } = await world(6);
    expect(await milkPrice()).toBe(6);
    files[`PriceFull${OSHER}-001-001-20261022-051600.xml`] = enc(milkXml(5)); // the next day's file
    await priceSyncJob(deps)({});
    expect(await milkPrice()).toBe(5);
  });

  it("is filled in for prices loaded before it existed", async () => {
    const { deps, milkPrice } = await world(6);
    deps.db.$client.exec("DELETE FROM store_browse; DELETE FROM browse_groups; DELETE FROM browse_catalog");
    expect(await milkPrice()).toBeUndefined();
    await refreshBrowse(deps.db);
    expect(await milkPrice()).toBe(6);
  });

  it("keeps a Chain's Promotion once for all its stores, and drops it once no store runs it", async () => {
    const { deps } = await world(6);
    ingestStores(deps, "osher-ad", storesXml);
    for (const store of [1, 2]) ingestPromotions(deps, "osher-ad", promosXml(store, ["1"]), `PromoFull${OSHER}-001-00${store}-20261104-010000.xml`);
    expect(count(deps, "chain_promotions")).toBe(1);
    expect(deps.db.$client.prepare("SELECT count(*) FROM store_browse WHERE length(offer_promotions) = 4").pluck().get()).toBe(2); // one id each
    for (const store of [1, 2]) ingestPromotions(deps, "osher-ad", promosXml(store, []), `PromoFull${OSHER}-001-00${store}-20261105-010000.xml`);
    await refreshBrowse(deps.db);
    expect(count(deps, "chain_promotions")).toBe(0);
  });
});
