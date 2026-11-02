import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupProductImage } from "@/features/items/imageLookup";

const rami = (code: string) => `https://img.rami-levy.co.il/product/${code}/small.jpg`;
const off = "https://images.openfoodfacts.org/images/products/729/000/001/1/front_he.3.400.jpg";
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const status = (n: number) => new Response(null, { status: n });

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
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
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(json({ status: 1, product: { image_front_url: off } }));
    expect(await lookupProductImage("7290000011")).toBe(off);
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
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(json({ product: { image_front_url: off } }));
    expect(await lookupProductImage("7290000011")).toBe(off);
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

  it("sends Open Food Facts a custom User-Agent naming the app", async () => {
    fetchMock.mockResolvedValueOnce(status(403)).mockResolvedValueOnce(json({ product: {} }));
    await lookupProductImage("7290000011");
    const headers = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(headers.get("User-Agent")).toMatch(/^Grocer\//);
  });
});
