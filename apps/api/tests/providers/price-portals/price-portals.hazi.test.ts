import { afterEach, describe, expect, it, vi } from "vitest";
import { chainByKey } from "#/ingest/chains.ts";
import { haziFiles, israelDate, pricePortals } from "#/providers/price-portals/price-portals.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const BLOB = "https://hazihinamprod01.blob.core.windows.net/regulatories";
// One row of the real table (2026-11-04), as served.
const row = (name: string) => `<tr>
  <td style="direction:ltr; width:150px;"><span>04-11-2026</span><span>23:57</span></td>
  <td>203</td>
  <td>${name}</td>
  <td>&#x5DE;&#x5D1;&#x5E6;&#x5E2;&#x5D9;&#x5DD;</td>
  <td>0.5</td>
  <td><a href="${BLOB}/${name}">הורדה</a></td>
</tr>`;
const page = (names: string[]) => `<table><tbody>${names.map(row).join("")}</tbody></table><a href="?p=2&s=&f=&t=1&d=">2</a>`;

describe("haziFiles", () => {
  it("reads each row's file name and plain blob link, ignoring pager links", () => {
    expect(haziFiles(page(["PriceFull7290700100008-000-203-20261104-003502.gz", "StoresFull7290700100008-000-20261104-010530.gz"]))).toEqual([
      { name: "PriceFull7290700100008-000-203-20261104-003502.gz", url: `${BLOB}/PriceFull7290700100008-000-203-20261104-003502.gz` },
      { name: "StoresFull7290700100008-000-20261104-010530.gz", url: `${BLOB}/StoresFull7290700100008-000-20261104-010530.gz` },
    ]);
    expect(haziFiles("<table></table>")).toEqual([]);
  });
});

describe("israelDate", () => {
  it("is the day in Israel, which runs ahead of UTC", () => {
    expect(israelDate(Date.parse("2026-11-04T21:59:00Z"))).toBe("2026-11-04");
    expect(israelDate(Date.parse("2026-11-04T22:01:00Z"))).toBe("2026-11-05");
  });
});

describe("pricePortals on Hazi Hinam", () => {
  it("lists stores, prices and promotions of today and yesterday, reading pages until an empty one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-04T10:00:00Z"));
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const u = new URL(String(url));
      requested.push(u.search);
      const [t, d, p] = ["t", "d", "p"].map((k) => u.searchParams.get(k)!);
      const day = d ? d.replaceAll("-", "") : "20261104";
      const names = { "1": `PriceFull7290700100008-000-203-${day}-00350${p}.gz`, "2": `PromoFull7290700100008-000-203-${day}-00350${p}.gz`, "3": `StoresFull7290700100008-000-${day}-010530.gz` };
      const pages = t === "3" ? 1 : 2;
      return new Response(Number(p) <= pages ? page([names[t as "1" | "2" | "3"]]) : "<table></table>");
    });
    const { files } = await pricePortals().open(chainByKey("hazi-hinam")!);
    expect(files.map((f) => f.name)).toEqual([
      "StoresFull7290700100008-000-20261104-010530.gz",
      "PriceFull7290700100008-000-203-20261104-003501.gz",
      "PriceFull7290700100008-000-203-20261104-003502.gz",
      "PromoFull7290700100008-000-203-20261104-003501.gz",
      "PromoFull7290700100008-000-203-20261104-003502.gz",
      "StoresFull7290700100008-000-20261103-010530.gz",
      "PriceFull7290700100008-000-203-20261103-003501.gz",
      "PriceFull7290700100008-000-203-20261103-003502.gz",
      "PromoFull7290700100008-000-203-20261103-003501.gz",
      "PromoFull7290700100008-000-203-20261103-003502.gz",
    ]);
    expect(requested).toContain("?t=1&d=2026-11-03&p=3");
    expect(requested).not.toContain("?t=1&d=&p=4");
  });

  it("fails the listing on an HTTP error", async () => {
    vi.stubGlobal("fetch", async () => new Response("blocked", { status: 403 }));
    await expect(pricePortals().open(chainByKey("hazi-hinam")!)).rejects.toThrow("hazi-hinam t=3 d= p=1: HTTP 403");
  });
});
