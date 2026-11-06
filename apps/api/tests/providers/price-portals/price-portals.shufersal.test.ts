import { afterEach, describe, expect, it, vi } from "vitest";
import { chainByKey } from "#/ingest/chains.ts";
import { pricePortals } from "#/providers/price-portals/price-portals.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const BLOB = "https://pricesprodpublic.blob.core.windows.net/promofull";
const A = "PromoFull7290027600007-007-347-20261104-030000.gz";
const B = "PromoFull7290027600007-007-348-20261104-030000.gz";
const FILE = new TextEncoder().encode("<root/>");
const link =(name: string, sig: string) => `<a href="${BLOB}/${name}?sv=2014-02-14&amp;sr=b&amp;sig=${sig}&amp;sp=r">x</a>`;

/** Shufersal whose PromoFull listing (catID=4) signs links with `sig()` and whose blobs answer 403 to an old sig. */
function stubShufersal(promoNames: () => string[], sig: () => string) {
  const listed: string[] = [];
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const u = new URL(String(url));
    if (u.host === "prices.shufersal.co.il") {
      const cat = u.searchParams.get("catID")!;
      listed.push(cat);
      return new Response(cat === "4" ? promoNames().map((n) => link(n, sig())).join("") : "<html></html>");
    }
    return u.searchParams.get("sig") === sig() ? new Response(FILE) : new Response("AuthenticationFailed", { status: 403 });
  });
  return listed;
}

describe("pricePortals on Shufersal", () => {
  it("lists Stores (5), PriceFull (2), Price updates (1), PromoFull (4) and Promo (3)", async () => {
    const listed = stubShufersal(() => [], () => "s");
    await pricePortals().open(chainByKey("shufersal")!);
    expect([...new Set(listed)].sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("re-lists the file's category once when its link expired (403), and every link of it is fresh after", async () => {
    let sig = "old";
    const listed = stubShufersal(() => [A, B], () => sig);
    const portal = await pricePortals().open(chainByKey("shufersal")!);
    listed.length = 0;
    sig = "new";
    const [a, b] = [A, B].map((n) => portal.files.find((f) => f.name === n)!);
    expect(await portal.download(a!)).toEqual(FILE);
    expect(await portal.download(b!)).toEqual(FILE);
    expect(listed).toEqual(["4"]);
  });

  it("fails a file that is no longer listed, and re-lists a category at most once per 10 min", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let sig = "old";
    let names = [A, B];
    const listed = stubShufersal(() => names, () => sig);
    const portal = await pricePortals().open(chainByKey("shufersal")!);
    const [a, b] = [A, B].map((n) => portal.files.find((f) => f.name === n)!);
    listed.length = 0;
    sig = "new";
    names = [];
    await expect(portal.download(a!)).rejects.toThrow(`${A}: HTTP 403`);
    await expect(portal.download(b!)).rejects.toThrow(`${B}: HTTP 403`);
    expect(listed).toEqual(["4"]);
    vi.setSystemTime(Date.now() + 11 * 60_000);
    names = [B];
    expect(await portal.download(b!)).toEqual(FILE);
    expect(listed).toEqual(["4", "4"]);
  });

  it("downloads the store's newer file when the expired one is no longer listed (hourly updates)", async () => {
    const A2 = A.replace("030000", "040000");
    let sig = "old";
    let names = [A];
    const listed = stubShufersal(() => names, () => sig);
    const portal = await pricePortals().open(chainByKey("shufersal")!);
    const a = portal.files.find((f) => f.name === A)!;
    listed.length = 0;
    sig = "new";
    names = [A2, B];
    expect(await portal.download(a)).toEqual(FILE);
    expect(listed).toEqual(["4"]);
  });
});
