import type { ChainSeed } from "#/ingest/chains.ts";

export type PriceFile = { name: string; url: string };

/** A logged-in visit to one chain's price-transparency portal. */
export type PortalSession = {
  files: PriceFile[];
  download(file: PriceFile): Promise<Uint8Array>;
};

/** The portals where chains publish their Stores and PriceFull files. */
export interface PricePortal {
  open(chain: ChainSeed): Promise<PortalSession>;
}
