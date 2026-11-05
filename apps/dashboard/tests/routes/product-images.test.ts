import { describe, expect, it } from "vitest";
import { prices, products, stores } from "api/src/db/appSchema.ts";
import { lookupProductImage, RAMI_LEVY_IMAGES, uploadedVersion } from "@grocer/shared/product-image";
import type { Deps } from "#/deps.ts";
import { post, setup } from "../seam.ts";

const RAMI = "7290058140886";
const MILK = "7290000066318";
const LOCAL = `${RAMI}:111`; // Chain-only: no barcode
const FOUND_AT_RAMI = `${RAMI_LEVY_IMAGES}${MILK}/small.jpg`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const GIF = new TextEncoder().encode("GIF89a.....");

/** Milk (found at Rami Levy by barcode unless a test says otherwise) and a Chain-only banana, both priced. */
function seeded(barcode: Deps["productImage"] = async (code) => (code === MILK ? FOUND_AT_RAMI : null)) {
  const ctx = setup({
    // The barcode answer from the fake; an uploaded image through the shared lookup, which answers it without a request.
    productImage: (code, uploaded) => (uploadedVersion(code, uploaded) !== undefined ? lookupProductImage(code, uploaded) : barcode(code)),
  });
  const { db } = ctx.api;
  db.insert(stores).values({ id: `${RAMI}-1`, chainId: RAMI, storeId: "1", subChainId: "1", name: "רמי לוי תלפיות", address: "רחוב 1", city: "ירושלים" }).run();
  db.insert(products).values([{ code: MILK, name: "חלב 3% 1 ליטר" }, { code: LOCAL, name: "בננות" }]).run();
  db.insert(prices).values([{ storeId: `${RAMI}-1`, code: MILK, price: 5.9 }, { storeId: `${RAMI}-1`, code: LOCAL, price: 9.9 }]).run();
  return ctx;
}

const page = async (app: ReturnType<typeof seeded>["app"], code = MILK) => (await app.request(`/products/${encodeURIComponent(code)}`)).text();
const tileOf = (html: string) => {
  const tile = html.slice(html.indexOf('id="product-image"'));
  return tile.slice(0, tile.indexOf("</button>"));
};
const form = (bytes?: Uint8Array<ArrayBuffer>) => {
  const f = new FormData();
  if (bytes) f.set("image", new File([bytes], "milk.png", { type: "image/png" }));
  return f;
};
const upload = (app: ReturnType<typeof seeded>["app"], code: string, bytes?: Uint8Array<ArrayBuffer>) =>
  app.request(`/products/${encodeURIComponent(code)}/image`, { ...post(), body: form(bytes) });
const remove = (app: ReturnType<typeof seeded>["app"], code: string) =>
  app.request(`/products/${encodeURIComponent(code)}/image`, { method: "DELETE", headers: { "Sec-Fetch-Site": "same-origin", "HX-Request": "true" } });
const uploadedList = async (privateApp: ReturnType<typeof seeded>["privateApp"]) =>
  ((await (await privateApp.request("/products/images", { headers: { Authorization: "Bearer test-sync-token" } })).json()) as { images: Record<string, string> })
    .images;

describe("The Product image tile (A7)", () => {
  it("names where the image comes from: Rami Levy, Open Food Facts, or none", async () => {
    expect(tileOf(await page(seeded().app))).toContain("From Rami Levy");
    expect(tileOf(await page(seeded(async () => "https://images.openfoodfacts.org/milk.jpg").app))).toContain("From Open Food Facts");
    const none = tileOf(await page(seeded(async () => null).app));
    expect(none).toContain("No Product image");
    expect(none).not.toContain("From ");
  });

  it("opens the A7b dialog: Now and New, the drop zone, the 400 px warning, Use the new image and Cancel", async () => {
    const html = await page(seeded().app);
    const dialog = html.slice(html.indexOf('<dialog id="image-dialog"'), html.indexOf("</dialog>"));
    expect(dialog).toContain("Product image");
    expect(dialog).toContain(`<img src="${FOUND_AT_RAMI}"`);
    expect(dialog).toContain("Found on Rami Levy’s image server by barcode");
    expect(dialog).toContain("choose a file");
    expect(dialog).toContain("PNG, JPG or WebP, up to 5 MB");
    expect(dialog).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(dialog).toContain("Narrower than 400 px: it may look blurry in the app.");
    expect(dialog).toMatch(/<button type="submit" class="button button-filled" disabled>Use the new image<\/button>/);
    expect(dialog).toContain(">Cancel</button>");
    expect(dialog).not.toContain("Remove my image");
  });
});

describe("Uploading a Product image (A7b)", () => {
  it("sends the file to the private app, then the page shows it as Uploaded, served by the dashboard", async () => {
    const { app, privateApp } = seeded();
    const res = await upload(app, MILK, PNG);
    expect(res.status).toBe(200);
    expect(res.headers.get("HX-Refresh")).toBe("true");
    const { [MILK]: version } = await uploadedList(privateApp);
    expect(version).toBeTruthy();
    const html = await page(app);
    const url = `/api/products/${MILK}/image?v=${version}`;
    expect(tileOf(html)).toContain(`<img src="${url}"`);
    expect(tileOf(html)).toContain("Uploaded");
    expect(html).toContain("Remove my image");
    const served = await app.request(url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
  });

  it("gives a Chain-only Product an image, and the list's thumbnail uses it", async () => {
    const { app } = seeded();
    await upload(app, LOCAL, PNG);
    expect(tileOf(await page(app, LOCAL))).toContain("Uploaded");
    expect(await (await app.request(`/products/${encodeURIComponent(LOCAL)}/image`)).text()).toContain(`/api/products/${encodeURIComponent(LOCAL)}/image?v=`);
  });

  it("shows the private app's refusal in the dialog: not an image, too large, or no file", async () => {
    const { app, privateApp } = seeded();
    for (const [body, message] of [
      [GIF, "The image must be a PNG, JPEG or WebP."],
      [new Uint8Array(5 * 1024 * 1024 + 1), "The image must be at most 5 MB."],
      [undefined, "Choose an image."],
    ] as const) {
      const res = await upload(app, MILK, body);
      expect(res.status).toBe(200);
      expect(res.headers.get("HX-Refresh")).toBeNull();
      expect(await res.text()).toContain(message);
    }
    expect(await uploadedList(privateApp)).toEqual({});
  });

  it("says so for a code that names no Product", async () => {
    expect(await (await upload(seeded().app, "7290000000000", PNG)).text()).toContain("No Product with this code.");
  });

  it("answers 404 for an image that was never uploaded", async () => {
    expect((await seeded().app.request(`/api/products/${MILK}/image`)).status).toBe(404);
  });
});

describe("Removing my image (A7b)", () => {
  it("goes back to the image found by barcode", async () => {
    const { app, privateApp } = seeded();
    await upload(app, MILK, PNG);
    const res = await remove(app, MILK);
    expect(res.status).toBe(200);
    expect(res.headers.get("HX-Refresh")).toBe("true");
    expect(await uploadedList(privateApp)).toEqual({});
    const html = await page(app);
    expect(tileOf(html)).toContain("From Rami Levy");
    expect(html).not.toContain("Remove my image");
  });
});
