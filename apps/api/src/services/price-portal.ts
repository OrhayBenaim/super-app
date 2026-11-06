import type { ChainSeed } from "#/ingest/chains.ts";

export type PriceFile = { name: string; url: string };

/** A logged-in visit to one chain's price-transparency portal. */
export type PortalSession = {
  files: PriceFile[];
  /** The file's XML, decompressed and decoded. Throws when it can't be downloaded or isn't a price file. */
  download(file: PriceFile): Promise<string>;
};

/** The portals where chains publish their Stores and PriceFull files. */
export interface PricePortal {
  open(chain: ChainSeed): Promise<PortalSession>;
}
