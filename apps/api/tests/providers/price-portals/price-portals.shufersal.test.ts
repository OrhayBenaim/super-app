import { afterEach, describe, expect, it, vi } from "vitest";
import { chainByKey } from "#/ingest/chains.ts";
import { pricePortals } from "#/providers/price-portals/price-portals.ts";

afterEach(() => vi.unstubAllGlobals());

describe("pricePortals on Shufersal", () => {
  it("lists Stores (5), PriceFull (2), Price updates (1), PromoFull (4) and Promo (3)", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      requested.push(String(url));
      return new Response("<html><body></body></html>", { status: 200 });
    });
    await pricePortals().open(chainByKey("shufersal")!);
    const cats = new Set(requested.map((u) => new URL(u).searchParams.get("catID")));
    expect([...cats].sort()).toEqual(["1", "2", "3", "4", "5"]);
  });
});
