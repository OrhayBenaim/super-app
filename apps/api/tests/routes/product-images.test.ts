import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { saveProductImage } from "#/db/product-images.ts";
import { loadConfig } from "#/services/config.ts";

const MILK = "7290000066318";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

// Public and unauthenticated: Product images are not private, and the app shows them by URL.
describe("GET /api/products/images", () => {
  it("lists nothing before any upload", async () => {
    const res = await createApp(buildDeps(loadConfig())).request("/api/products/images");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ images: {} });
  });

  it("lists each uploaded code with its version", async () => {
    const deps = buildDeps(loadConfig());
    await saveProductImage(deps.imagesDir, MILK, PNG);
    const { images } = (await (await createApp(deps).request("/api/products/images")).json()) as { images: Record<string, string> };
    expect(Object.keys(images)).toEqual([MILK]);
    expect(images[MILK]).toMatch(/^[0-9a-z]+$/);
  });
});

describe("GET /api/products/:code/image", () => {
  it("serves the uploaded image with cache headers", async () => {
    const deps = buildDeps(loadConfig());
    await saveProductImage(deps.imagesDir, MILK, PNG);
    const res = await createApp(deps).request(`/api/products/${MILK}/image`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it("answers 404 for a Product with no uploaded image", async () => {
    expect((await createApp(buildDeps(loadConfig())).request(`/api/products/${MILK}/image`)).status).toBe(404);
  });

  it("answers 400 for a code longer than any Product code", async () => {
    expect((await createApp(buildDeps(loadConfig())).request(`/api/products/${"7".repeat(300)}/image`)).status).toBe(400);
  });

  it("never reads outside its folder, whatever the code", async () => {
    const deps = buildDeps(loadConfig());
    await saveProductImage(deps.imagesDir, MILK, PNG);
    expect((await createApp(deps).request(`/api/products/${encodeURIComponent("../images")}/image`)).status).toBe(404);
  });
});
