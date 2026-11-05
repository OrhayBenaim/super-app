import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CACHE_SIZE = 2_000;

// The module caches answers, so each test imports a fresh copy.
let lookupProductImage: typeof import("@grocer/shared/product-image").lookupProductImage;
let hasImageSource: typeof import("@grocer/shared/product-image").hasImageSource;

const rami = (code: string) => `https://img.rami-levy.co.il/product/${code}/small.jpg`;
const offImage = "https://images.openfoodfacts.org/images/products/729/000/001/1/front_he.3.400.jpg";
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const status = (n: number) => new Response(null, { status: n });

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  ({ lookupProductImage, hasImageSource } = await import("@grocer/shared/product-image"));
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("lookupProductImage", () => {
  it("returns no image for a Chain-only code without calling the network", async () => {
    expect(await lookupProductImage("7:12345")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns Rami Levy's URL on 200 and never asks Open Food Facts", async () => {
    fetchMock.mockResolvedValueOnce(status(200));
    expect(await lookupProductImage("7290000011")).toBe(rami("7290000011"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(rami("7290000011"));
  });

  it("falls back to Open Food Facts' image_front_url when Rami Levy answers 403", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(json({ status: 1, product: { image_front_url: offImage } }));
    expect(await lookupProductImage("7290000011")).toBe(offImage);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://world.openfoodfacts.org/api/v2/product/7290000011.json?fields=image_front_url");
  });

  it("returns no image when Open Food Facts has the product but no image", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(json({ status: 1, product: {} }));
    expect(await lookupProductImage("7290000011")).toBeNull();
  });

  it("returns no image when Open Food Facts does not know the product", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(new Response(JSON.stringify({ status: 0, status_verbose: "product not found" }), { status: 404 }));
    expect(await lookupProductImage("7290000011")).toBeNull();
  });

  it("falls back to Open Food Facts when Rami Levy throws a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(json({ product: { image_front_url: offImage } }));
    expect(await lookupProductImage("7290000011")).toBe(offImage);
  });

  it("returns no image, without throwing, when Open Food Facts throws", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await lookupProductImage("7290000011")).toBeNull();
  });

  it("returns no image, without throwing, when Open Food Facts returns malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(new Response("<html>oops", { status: 200 }));
    expect(await lookupProductImage("7290000011")).toBeNull();
  });

  it("ignores a non-string image_front_url", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(json({ product: { image_front_url: 42 } }));
    expect(await lookupProductImage("7290000011")).toBeNull();
  });

  it("returns no image when a request stalls past the timeout", async () => {
    vi.useFakeTimers();
    const stall = (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    fetchMock.mockImplementation(stall);
    const result = lookupProductImage("7290000011");
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("sends Open Food Facts a custom User-Agent naming the app", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(json({ product: {} }));
    await lookupProductImage("7290000011");
    const headers = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(headers.get("User-Agent")).toMatch(/^Grocer\//);
  });

  it("shares one lookup between concurrent calls for a code, and answers later calls from memory", async () => {
    fetchMock.mockResolvedValueOnce(status(200));
    const [a, b] = await Promise.all([lookupProductImage("7290000011"), lookupProductImage("7290000011")]);
    expect([a, b, await lookupProductImage("7290000011")]).toEqual([rami("7290000011"), rami("7290000011"), rami("7290000011")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remembers a code with no image too", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(json({ product: {} }));
    await lookupProductImage("7290000011");
    expect(await lookupProductImage("7290000011")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("forgets the least recently asked code once more than 2,000 codes are cached", async () => {
    fetchMock.mockImplementation(async () => status(200));
    await lookupProductImage("100");
    await lookupProductImage("101");
    for (let n = 2; n < CACHE_SIZE; n++) await lookupProductImage(String(1000 + n)); // the cache is now full
    await lookupProductImage("100"); // asked again, so "101" is now the least recent
    await lookupProductImage("9999"); // one past the bound: "101" goes
    fetchMock.mockClear();
    await lookupProductImage("100");
    expect(fetchMock).not.toHaveBeenCalled();
    await lookupProductImage("101");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("an uploaded Product image (docs/adr/0008)", () => {
  const uploaded = { base: "https://api.grocer.test/api", versions: { "7290000011": "m1", "7:12345": "m2" } };

  it("answers the api's URL for an uploaded code, with its version, and never asks the barcode sources", async () => {
    expect(await lookupProductImage("7290000011", uploaded)).toBe("https://api.grocer.test/api/products/7290000011/image?v=m1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers the api's URL for a Chain-only code that has an uploaded image", async () => {
    expect(await lookupProductImage("7:12345", uploaded)).toBe("https://api.grocer.test/api/products/7%3A12345/image?v=m2");
  });

  it("looks up a code with no uploaded image by barcode as before", async () => {
    fetchMock.mockResolvedValueOnce(status(200));
    expect(await lookupProductImage("7290000099", uploaded)).toBe(rami("7290000099"));
  });

  it("goes back to the barcode answer once the upload is removed", async () => {
    fetchMock.mockResolvedValueOnce(status(200));
    expect(await lookupProductImage("7290000011", uploaded)).toContain("api.grocer.test");
    expect(await lookupProductImage("7290000011", { ...uploaded, versions: {} })).toBe(rami("7290000011"));
  });

  it("is not fooled by a code named like an Object property", async () => {
    expect(await lookupProductImage("toString", uploaded)).toBeNull();
  });

  it("says which codes have a source: a barcode, or an uploaded image", () => {
    expect([hasImageSource("7290000099"), hasImageSource("7:12345"), hasImageSource("7:12345", uploaded), hasImageSource(null, uploaded)]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
