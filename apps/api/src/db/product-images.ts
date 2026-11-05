// The Product images the Grocer team uploads on the Internal dashboard (docs/adr/0008): one file per Product code under
// IMAGES_DIR, on the database's volume. The file name is the code in hex, so no code can name a path outside the folder.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The largest image an upload may be. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, at: number, magic: number[]) => magic.every((b, i) => bytes[at + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The image's type by its first bytes: PNG, JPEG or WebP, else null (whatever its name or the browser says). */
export function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, 0, ascii("RIFF")) && startsWith(bytes, 8, ascii("WEBP"))) return "image/webp";
  return null;
}

const fileOf = (dir: string, code: string) => join(dir, Buffer.from(code).toString("hex"));
const isImageFile = (name: string) => /^(?:[0-9a-f]{2})+$/.test(name);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Stores (or replaces) a code's image, atomically: a reader sees the old file or the new one, never half of one. */
export async function saveProductImage(dir: string, code: string, bytes: Uint8Array) {
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `${randomUUID()}.tmp`);
  await writeFile(temp, bytes);
  await rename(temp, fileOf(dir, code));
}

/** A code's uploaded image with its type, or null when it has none. */
export async function readProductImage(dir: string, code: string) {
  try {
    const bytes = new Uint8Array(await readFile(fileOf(dir, code)));
    return { bytes, type: imageType(bytes) ?? "application/octet-stream" };
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

/** Removes a code's uploaded image; false when it had none. */
export async function removeProductImage(dir: string, code: string) {
  try {
    await unlink(fileOf(dir, code));
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

/** Every code with an uploaded image, to a version that changes with each upload (its file's modification time). */
export async function listProductImages(dir: string): Promise<Record<string, string>> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter(isImageFile);
  } catch (error) {
    if (missing(error)) return {};
    throw error;
  }
  // A file removed since readdir is skipped.
  const times = await Promise.all(names.map((name) => stat(join(dir, name)).then((s) => s.mtimeMs, () => null)));
  return Object.fromEntries(names.flatMap((name, i) => (times[i] === null ? [] : [[Buffer.from(name, "hex").toString(), Math.trunc(times[i]).toString(36)]])));
}
