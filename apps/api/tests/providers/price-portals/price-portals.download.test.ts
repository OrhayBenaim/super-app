import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chainByKey } from "#/ingest/chains.ts";
import { pricePortals } from "#/providers/price-portals/price-portals.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const NAME = "PriceFull7290696200003-001-058-20261101-080802.gz";
const XML = '<?xml version="1.0" encoding="utf-8"?><root><ChainId>7290696200003</ChainId></root>';
const PRICE_FILE = gzipSync(XML);
const closed = () => Promise.reject(new TypeError("fetch failed", { cause: new Error("other side closed") }));

/** Victory (laibcatalog) whose downloads answer with `answers` in turn, the last one repeating. */
async function victory(answers: (() => Promise<Response>)[]) {
  let downloads = 0;
  vi.stubGlobal("fetch", async (url: string | URL) => {
    if (String(url).includes("/api/getfiles")) return Response.json([{ fileName: NAME }]);
    return answers[Math.min(downloads++, answers.length - 1)]!();
  });
  const portal = await pricePortals().open(chainByKey("victory")!);
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  const download = portal.download(portal.files[0]!);
  download.catch(() => {}); // asserted below, after the pauses run
  await vi.runAllTimersAsync();
  return { download, downloads: () => downloads };
}

describe("pricePortals download", () => {
  it("retries a closed connection and returns the file", async () => {
    const { download, downloads } = await victory([closed, async () => new Response(PRICE_FILE)]);
    expect(await download).toBe(XML);
    expect(downloads()).toBe(2);
  });

  it("retries a cut-off gzip and a body that isn't a price file", async () => {
    const { download, downloads } = await victory([
      async () => new Response(PRICE_FILE.subarray(0, PRICE_FILE.length - 10)),
      async () => new Response("<html><body>Service Unavailable</body></html>"),
      async () => new Response(PRICE_FILE),
    ]);
    expect(await download).toBe(XML);
    expect(downloads()).toBe(3);
  });

  it("retries a gzipped error page", async () => {
    const { download, downloads } = await victory([
      async () => new Response(gzipSync("<html><body>Service Unavailable</body></html>")),
      async () => new Response(PRICE_FILE),
    ]);
    expect(await download).toBe(XML);
    expect(downloads()).toBe(2);
  });

  it("throws the last error after three failed attempts", async () => {
    const { download, downloads } = await victory([closed, closed, async () => new Response("", { status: 503 })]);
    await expect(download).rejects.toThrow(`${NAME}: HTTP 503`);
    expect(downloads()).toBe(3);
  });

  it("retries a 429 and other 4xx like any failed attempt", async () => {
    const { download, downloads } = await victory([
      async () => new Response("Too Many Requests", { status: 429 }),
      async () => new Response("Forbidden", { status: 403 }),
      async () => new Response(PRICE_FILE),
    ]);
    expect(await download).toBe(XML);
    expect(downloads()).toBe(3);
  });

  it("throws a 404 at once: the file is gone", async () => {
    const { download, downloads } = await victory([async () => new Response("Not Found", { status: 404 })]);
    await expect(download).rejects.toThrow(`${NAME}: HTTP 404`);
    expect(downloads()).toBe(1);
  });

  it("after 3 files in a row fail, tries each later file once, until one downloads", async () => {
    const names = [1, 2, 3, 4, 5, 6].map((n) => NAME.replace("-058-", `-00${n}-`));
    const tries: Record<string, number> = {};
    vi.stubGlobal("fetch", async (url: string | URL) => {
      if (String(url).includes("/api/getfiles")) return Response.json(names.map((fileName) => ({ fileName })));
      const name = names.find((n) => String(url).includes(n))!;
      tries[name] = (tries[name] ?? 0) + 1;
      // The 5th answers its first try; the 6th drops once, then answers. The rest always drop.
      if (name === names[4] || (name === names[5] && tries[name] > 1)) return new Response(PRICE_FILE);
      return closed();
    });
    const portal = await pricePortals().open(chainByKey("victory")!);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const results: unknown[] = [];
    for (const name of names) {
      const download = portal.download(portal.files.find((f) => f.name === name)!).catch((e: Error) => e);
      await vi.runAllTimersAsync();
      results.push(await download);
    }
    expect(names.map((n) => tries[n])).toEqual([3, 3, 3, 1, 1, 2]);
    expect(results.slice(4)).toEqual([XML, XML]);
  });
});
