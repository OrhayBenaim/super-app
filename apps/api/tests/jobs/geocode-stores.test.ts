import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { ingestStores, readXml } from "#/ingest/ingest.ts";
import { geocodeStoresJob } from "#/jobs/geocode-stores.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { loadConfig } from "#/services/config.ts";

const osher = readXml(fileURLToPath(new URL("../__fixtures__/Stores7290103152017-000-20261021-080500.xml", import.meta.url)));
const rami = "<Root><ChainId>7290058140886</ChainId><Stores><Store><StoreId>1</StoreId><StoreName>r</StoreName><Address>a</Address><City>c</City></Store></Stores></Root>";
const located = (deps: ReturnType<typeof buildDeps>) =>
  (deps.db.$client.prepare("SELECT count(*) AS n FROM stores WHERE lat IS NOT NULL AND lng IS NOT NULL").get() as { n: number }).n;

let deps: ReturnType<typeof buildDeps>;
let total: number;

beforeEach(() => {
  deps = buildDeps(loadConfig());
  total = ingestStores(deps, "osher-ad", osher);
});

describe("geocodeStoresJob", () => {
  it("fills lat/lng of every store without coordinates", async () => {
    deps = { ...deps, geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })) };
    expect(await geocodeStoresJob(deps)({})).toBe(total);
    expect(located(deps)).toBe(total);
    expect(deps.db.$client.prepare("SELECT lat, lng FROM stores LIMIT 1").get()).toEqual({ lat: 32, lng: 34 });
  });

  it("the chain filter limits the rows", async () => {
    ingestStores(deps, "rami-levy", rami);
    const geocoder = fakeGeocoder(() => ({ lat: 1, lng: 2 }));
    deps = { ...deps, geocoder };
    expect(await geocodeStoresJob(deps)({ chain: "rami-levy" })).toBe(1);
    expect(geocoder.calls).toHaveLength(1);
    expect(located(deps)).toBe(1);
  });

  it("a geocoder that throws for one store does not stop the run", async () => {
    let n = 0;
    deps = {
      ...deps,
      geocoder: fakeGeocoder(() => {
        if (n++ === 0) throw new Error("rate limited");
        return { lat: 3, lng: 4 };
      }),
    };
    expect(await geocodeStoresJob(deps)({})).toBe(total - 1);
    expect(located(deps)).toBe(total - 1);
  });

  it("leaves stores that are not found without coordinates", async () => {
    deps = { ...deps, geocoder: fakeGeocoder(() => null) };
    expect(await geocodeStoresJob(deps)({})).toBe(0);
    expect(located(deps)).toBe(0);
  });

  it("throws on an unknown chain", async () => {
    await expect(geocodeStoresJob(deps)({ chain: "nope" })).rejects.toThrow();
  });
});
