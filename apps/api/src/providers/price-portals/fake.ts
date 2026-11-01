import type { PriceFile, PricePortal } from "#/services/price-portal.ts";

/** Serves the given files (name -> bytes) for every chain. */
export function fakePricePortal(files: Record<string, Uint8Array>) {
  const downloaded: string[] = [];
  const fake = {
    downloaded,
    async open() {
      return {
        files: Object.keys(files).map((name) => ({ name, url: `fake://${name}` })),
        async download(file: PriceFile) {
          const buf = files[file.name];
          if (!buf) throw new Error(`${file.name}: not found`);
          downloaded.push(file.name);
          return buf;
        },
      };
    },
  };
  return fake satisfies PricePortal;
}
