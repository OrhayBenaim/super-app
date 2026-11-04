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

const fx = (f: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../__fixtures__/${f}`, import.meta.url))));
const OSHER = "7290103152017";
const [MILK, BREAD, EGGS] = ["7290000000001", "7290000000002", "7290000000003"].map((c) => `${OSHER}:${c}`);
// Store 1 in the PriceFull fixture: milk 6.00, bread 7.00, eggs 12.00. Store 2: milk 5.50, eggs 11.00.
const base = {
  [`Stores${OSHER}-000-20261021-080500.xml`]: fx(`Stores${OSHER}-000-20261021-080500.xml`),
  [`PriceFull${OSHER}-001-001-20261021-051600.gz`]: fx(`PriceFull${OSHER}-001-001-20261021-051600.gz`),
  [`PriceFull${OSHER}-001-002-20261021-051600.xml`]: fx(`PriceFull${OSHER}-001-002-20261021-051600.xml`),
};
const fullStore1 = { [MILK]: 6, [BREAD]: 7, [EGGS]: 12 };

const item = (code: string, price: string, status = 1) =>
  `<Item><ItemCode>${code}</ItemCode><ItemType>1</ItemType><ItemName>x ${code}</ItemName><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><ItemStatus>${status}</ItemStatus></Item>`;
const update = (items: string[], chain = OSHER) =>
  new TextEncoder().encode(
    `<?xml version="1.0" encoding="utf-8"?><Root><ChainId>${chain}</ChainId><SubChainId>001</SubChainId><StoreId>001</StoreId><Items>${items.join("")}</Items></Root>`,
  );
const upName = (ts: string) => `Price${OSHER}-001-001-${ts}.xml`;
const milk = (price: string) => item("7290000000001", price);

const setup = (extra: Record<string, Uint8Array>, overrides: Partial<Deps> = {}) =>
  buildDeps(loadConfig(), { pricePortal: fakePricePortal({ ...base, ...extra }), geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })), ...overrides });

/** Syncs, then asks Compare for milk, bread and eggs; returns each store's priced codes and the Osher result row. */
async function syncAndCompare(deps: Deps) {
  const id = await priceSyncJob(deps)({});
  const app = createApp(deps);
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dana@updates.test", password: "password1234", name: "Dana" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const res = await app.request("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ lat: 32, lng: 34, items: [MILK, BREAD, EGGS].map((code) => ({ code, quantity: 1 })), sort: "price" }),
  });
  const body = (await res.json()) as { stores: { storeId: string; items: { code: string; price: number }[] }[] };
  const stores = Object.fromEntries(body.stores.map((s) => [s.storeId.split("-")[1], Object.fromEntries(s.items.map((i) => [i.code, i.price]))]));
  const result = deps.db.$client.prepare("SELECT status, files_downloaded, error FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?").get(id, OSHER);
  return { stores, result };
}

describe("priceSyncJob price update files", () => {
  it("applies only the newest update after the full file: its price replaces the full file's, absent rows stay", async () => {
    const { stores, result } = await syncAndCompare(
      setup({
        [upName("20261021-060000")]: update([milk("3.00")]), // older update: not applied
        [upName("20261021-120000")]: update([milk("4.00")]),
        [upName("20261021-040000")]: update([milk("1.00")]), // older than the full file: not applied
      }),
    );
    expect(stores["1"]).toEqual({ ...fullStore1, [MILK]: 4 });
    expect(stores["2"]).toEqual({ [MILK]: 5.5, [EGGS]: 11 });
    expect(result).toMatchObject({ status: "ok", files_downloaded: 4 });
  });

  it("an update older than the full file is not loaded", async () => {
    const { stores, result } = await syncAndCompare(setup({ [upName("20261021-040000")]: update([milk("1.00")]) }));
    expect(stores["1"]).toEqual(fullStore1);
    expect(result).toMatchObject({ status: "ok", files_downloaded: 3 });
  });

  it("a product the update marks removed (ItemStatus 0) is not priced at that store", async () => {
    const { stores } = await syncAndCompare(setup({ [upName("20261021-120000")]: update([item("7290000000002", "7.00", 0)]) }));
    expect(stores["1"]).toEqual({ [MILK]: 6, [EGGS]: 12 });
    expect(stores["2"]).toEqual({ [MILK]: 5.5, [EGGS]: 11 });
  });

  it("an update that cannot be downloaded (HTML page) leaves the full file's prices and does not fail the Chain", async () => {
    const html = new TextEncoder().encode("<html><body>please log in</body></html>");
    const { stores, result } = await syncAndCompare(setup({ [upName("20261021-120000")]: html }));
    expect(stores["1"]).toEqual(fullStore1);
    expect(result).toMatchObject({ status: "ok", error: null });
  });

  it("an update whose download rejects leaves the full file's prices and does not fail the Chain", async () => {
    const name = upName("20261021-120000");
    const inner = fakePricePortal({ ...base, [name]: update([milk("4.00")]) });
    const portal: PricePortal = {
      async open() {
        const session = await inner.open();
        return { ...session, download: (f) => (f.name === name ? Promise.reject(new Error("timeout")) : session.download(f)) };
      },
    };
    const { stores, result } = await syncAndCompare(setup({}, { pricePortal: portal, errorHandler: fakeErrorHandler() }));
    expect(stores["1"]).toEqual(fullStore1);
    expect(result).toMatchObject({ status: "ok", error: null });
  });

  it.each([
    ["is for another Chain", update([milk("4.00")], "7290000000000")],
    ["is not XML", new TextEncoder().encode("<Root><Items><Item>")],
  ])("an update that %s cannot be loaded, leaves the full file's prices and does not fail the Chain", async (_why, bytes) => {
    const { stores, result } = await syncAndCompare(setup({ [upName("20261021-120000")]: bytes }));
    expect(stores["1"]).toEqual(fullStore1);
    expect(result).toMatchObject({ status: "ok", error: null });
  });
});
