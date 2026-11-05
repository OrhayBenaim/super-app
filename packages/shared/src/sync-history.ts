/** How long Price syncs (with their Chain results) are kept: the Price sync deletes older ones, the Internal dashboard lists these. */
export const SYNC_HISTORY = { days: 90 } as const;

/** A Chain's outcome in one Price sync, worst first: a Chain failure, else a Promotion failure (its prices still updated), else ok. */
export const CHAIN_OUTCOMES = ["failed", "promotionFailed", "ok"] as const;
export type ChainOutcome = (typeof CHAIN_OUTCOMES)[number];
export const chainOutcome = (r: { status: "ok" | "failed"; promotionStatus: "ok" | "failed" | null }): ChainOutcome =>
  r.status === "failed" ? "failed" : r.promotionStatus === "failed" ? "promotionFailed" : "ok";
