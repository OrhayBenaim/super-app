import { describe, expect, it, vi } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const here = { lat: 32.0853, lng: 34.7818 };
const enc = (s: string) => new TextEncoder().encode(s);
const storesXml = `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>001</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>near</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const milkXml = (price: number) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>1</StoreID><Items Count="1"><Item><PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>1</ItemCode><ItemType>1</ItemType><ItemName>חלב תנובה 3% 1 ליטר</ItemName><ManufacturerName></ManufacturerName><UnitQty>ליטר</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice><ItemStatus>1</ItemStatus></Item></Items></Root>`;

describe("browse's in-memory price index", () => {
  it("keeps answering from the old prices while a Price sync's new ones load, then shows them", async () => {
    const files: Record<string, Uint8Array> = {
      [`Stores${OSHER}-000-20261021-080500.xml`]: enc(storesXml),
      [`PriceFull${OSHER}-001-001-20261021-051600.xml`]: enc(milkXml(6)),
    };
    const deps = buildDeps(loadConfig(), { pricePortal: fakePricePortal(files), geocoder: fakeGeocoder(() => here) });
    await priceSyncJob(deps)({});
    const app = createApp(deps);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "index@browse.test", password: "password1234", name: "Ida" }),
    });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const milkPrice = async () => {
      const cards = (await (await app.request(`/api/browse/types/other?lat=${here.lat}&lng=${here.lng}`, { headers: { cookie } })).json()) as { minPrice: number }[];
      return cards[0]?.minPrice;
    };
    expect(await milkPrice()).toBe(6);

    files[`PriceFull${OSHER}-001-001-20261022-051600.xml`] = enc(milkXml(5)); // the next day's file
    await priceSyncJob(deps)({});
    expect(await milkPrice()).toBe(6); // the request that notices the sync is not the one that waits for it
    await vi.waitFor(async () => expect(await milkPrice()).toBe(5));
  });
});
