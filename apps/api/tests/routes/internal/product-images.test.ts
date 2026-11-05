import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { products } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";

const TOKEN = "test-sync-token";
const MILK = "7290000066318";
const LOCAL = "7290103152017:111"; // a Chain-only code: no barcode
const MB = 1024 * 1024;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 ")]);
const GIF = new TextEncoder().encode("GIF89a.....");

function setup() {
  const deps = buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }));
  deps.db.insert(products).values([{ code: MILK, name: "חלב 3% 1 ליטר" }, { code: LOCAL, name: "בננות" }]).run();
  return deps;
}
const call = (deps: Deps, method: string, path: string, body?: FormData, auth = `Bearer ${TOKEN}`) =>
  createInternalApp(deps).request(path, { method, body, headers: { Authorization: auth } });
const form = (bytes: Uint8Array<ArrayBuffer>, name = "milk.png") => {
  const f = new FormData();
  f.set("image", new File([bytes], name, { type: "application/octet-stream" }));
  return f;
};
const upload = (deps: Deps, code: string, bytes: Uint8Array<ArrayBuffer>) => call(deps, "PUT", `/products/${encodeURIComponent(code)}/image`, form(bytes));
const listed = async (deps: Deps) => ((await (await createApp(deps).request("/api/products/images")).json()) as { images: Record<string, string> }).images;

describe("PUT /products/:code/image (private)", () => {
  it("refuses a request without the bearer", async () => {
    const deps = setup();
    expect((await call(deps, "PUT", `/products/${MILK}/image`, form(PNG), "Bearer wrong")).status).toBe(401);
    expect((await call(deps, "DELETE", `/products/${MILK}/image`, undefined, "")).status).toBe(401);
  });

  it("stores a PNG, a JPEG or a WebP, checked by its bytes, and the public api then serves it", async () => {
    for (const [bytes, type] of [[PNG, "image/png"], [JPEG, "image/jpeg"], [WEBP, "image/webp"]] as const) {
      const deps = setup();
      const res = await upload(deps, MILK, bytes);
      expect(res.status).toBe(200);
      const served = await createApp(deps).request(`/api/products/${MILK}/image`);
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toBe(type);
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
    }
  });

  it("gives a Chain-only code an image too", async () => {
    const deps = setup();
    expect((await upload(deps, LOCAL, PNG)).status).toBe(200);
    expect(Object.keys(await listed(deps))).toEqual([LOCAL]);
    expect((await createApp(deps).request(`/api/products/${encodeURIComponent(LOCAL)}/image`)).status).toBe(200);
  });

  it("refuses a file that is not a PNG, JPEG or WebP, whatever its name says", async () => {
    const deps = setup();
    const res = await upload(deps, MILK, GIF);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The image must be a PNG, JPEG or WebP." });
    expect(await listed(deps)).toEqual({});
  });

  it("refuses an image over 5 MB and takes one of exactly 5 MB", async () => {
    const deps = setup();
    const big = new Uint8Array(5 * MB + 1);
    big.set(PNG);
    const res = await upload(deps, MILK, big);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "The image must be at most 5 MB." });
    expect((await upload(deps, MILK, big.subarray(0, 5 * MB))).status).toBe(200);
  });

  it("refuses a form without an image", async () => {
    const deps = setup();
    expect((await call(deps, "PUT", `/products/${MILK}/image`, new FormData())).status).toBe(400);
  });

  it("answers 404 for a code that names no Product, and stores nothing", async () => {
    const deps = setup();
    expect((await upload(deps, "7290000000000", PNG)).status).toBe(404);
    expect(await listed(deps)).toEqual({});
  });

  it("replaces the image: one per code, and a new version so caches fetch it again", async () => {
    const deps = setup();
    await upload(deps, MILK, PNG);
    const first = (await listed(deps))[MILK];
    await new Promise((r) => setTimeout(r, 5));
    await upload(deps, MILK, JPEG);
    const images = await listed(deps);
    expect(Object.keys(images)).toEqual([MILK]);
    expect(images[MILK]).not.toBe(first);
    expect((await createApp(deps).request(`/api/products/${MILK}/image`)).headers.get("content-type")).toBe("image/jpeg");
  });
});

describe("DELETE /products/:code/image (private)", () => {
  it("removes the uploaded image, so the barcode lookup answers again", async () => {
    const deps = setup();
    await upload(deps, MILK, PNG);
    expect((await call(deps, "DELETE", `/products/${MILK}/image`)).status).toBe(200);
    expect(await listed(deps)).toEqual({});
    expect((await createApp(deps).request(`/api/products/${MILK}/image`)).status).toBe(404);
  });

  it("answers 404 when the Product has no uploaded image", async () => {
    expect((await call(setup(), "DELETE", `/products/${MILK}/image`)).status).toBe(404);
  });
});

describe("GET /products/images and /products/:code/image (private, for the dashboard)", () => {
  it("lists and serves the same as the public api", async () => {
    const deps = setup();
    await upload(deps, MILK, PNG);
    expect(await (await call(deps, "GET", "/products/images")).json()).toEqual({ images: await listed(deps) });
    expect((await call(deps, "GET", `/products/${MILK}/image`)).headers.get("content-type")).toBe("image/png");
  });
});
