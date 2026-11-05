import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listProductImages, removeProductImage, saveProductImage } from "#/db/product-images.ts";

const MILK = "7290000066318";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const hex = (code: string) => Buffer.from(code).toString("hex");
const freshDir = () => mkdtemp(join(tmpdir(), "grocer-images-test-"));

describe("saveProductImage", () => {
  it("leaves no temp file behind when the save fails", async () => {
    const dir = await freshDir();
    // A non-empty folder where the image goes: the rename onto it fails.
    await mkdir(join(dir, hex(MILK)));
    await writeFile(join(dir, hex(MILK), "x"), "x");
    await expect(saveProductImage(dir, MILK, PNG)).rejects.toThrow();
    expect(await readdir(dir)).toEqual([hex(MILK)]);
  });
});

describe("listProductImages", () => {
  it("reads the folder once, and again after each save or remove", async () => {
    const dir = await freshDir();
    expect(await listProductImages(dir)).toEqual({});
    // A file the api did not write is not seen until the api next saves or removes one.
    await writeFile(join(dir, hex("1")), PNG);
    expect(await listProductImages(dir)).toEqual({});
    await saveProductImage(dir, MILK, PNG);
    expect(Object.keys(await listProductImages(dir)).sort()).toEqual(["1", MILK]);
    await removeProductImage(dir, MILK);
    expect(Object.keys(await listProductImages(dir))).toEqual(["1"]);
  });
});
