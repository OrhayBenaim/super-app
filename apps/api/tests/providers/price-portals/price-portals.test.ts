import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickFiles } from "#/ingest/files.ts";
import {
  carrefourFiles,
  cookieHeader,
  csrfToken,
  laibFiles,
  shufersalLastPage,
  shufersalLinks,
  storeCookies,
  type Jar,
} from "#/providers/price-portals/price-portals.ts";

const fixture = (name: string) => readFileSync(new URL(`../../__fixtures__/real/${name}`, import.meta.url), "utf8");

describe("cookie jar", () => {
  it("keeps name=value, drops attributes, and replaces a rotated cookie", () => {
    const jar: Jar = new Map();
    storeCookies(jar, ["cftpSID=abc; Path=/; Secure; HttpOnly; SameSite=Lax;", "x=1=2; Path=/"]);
    storeCookies(jar, ["cftpSID=def; Path=/; Secure; HttpOnly"]);
    expect(cookieHeader(jar)).toBe("cftpSID=def; x=1=2");
  });

  it("reads the Cerberus csrftoken meta tag", () => {
    expect(csrfToken('<meta name="csrftoken" content="EE-WCfA6t5q_TNC"/>')).toBe("EE-WCfA6t5q_TNC");
    expect(csrfToken("<html></html>")).toBeUndefined();
  });
});

describe("shufersalLinks on a captured listing page", () => {
  it("extracts the signed blob links with &amp; decoded, ignoring sort/paging links", () => {
    const links = shufersalLinks(fixture("shufersal-list.html"));
    expect(links.map((l) => l.name)).toEqual([1, 2, 3].map((n) => `PriceFull7290027600007-001-00${n}-20261101-032630.gz`));
    expect(links[0]!.url).toMatch(/^https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/PriceFull7290027600007-001-001-20261101-032630\.gz\?sv=[^&]+&sr=b&sig=/);
  });
});

describe("shufersalLastPage", () => {
  it("reads the last page from the pager of a captured page 1, so listing covers every store, not the first 20", () => {
    expect(shufersalLastPage(fixture("shufersal-list.html"))).toBe(22);
    expect(shufersalLastPage("<table></table>")).toBe(1);
  });
});

describe("laibFiles on a captured Victory getfiles response", () => {
  const VICTORY = "7290696200003";
  const files = laibFiles(JSON.parse(fixture("laibcatalog-getfiles.json")) as { fileName: string }[], VICTORY);

  it("downloads from webapi/<chainId>/<fileName>", () => {
    expect(files[2]).toEqual({
      name: `PriceFull${VICTORY}-001-084-20261101-152518.gz`,
      url: `https://laibcatalog.co.il/webapi/${VICTORY}/PriceFull${VICTORY}-001-084-20261101-152518.gz`,
    });
  });

  it("feeds pickFiles: the Stores file and one PriceFull per branch", () => {
    const { stores, prices } = pickFiles(files, 10, [VICTORY]);
    expect(stores?.name).toBe(`Stores${VICTORY}-000-20261101060100-060100.gz`);
    expect(prices.map((p) => p.name)).toEqual([`PriceFull${VICTORY}-001-058-20261101-080802.gz`, `PriceFull${VICTORY}-001-084-20261101-152518.gz`]);
  });
});

describe("carrefourFiles on a captured prices.carrefour.co.il page", () => {
  const BASE = "https://prices.carrefour.co.il/";

  it("joins the inline `path` folder and every name of the inline `files` array", () => {
    const files = carrefourFiles(fixture("carrefour-page.html"), BASE);
    expect(files).toHaveLength(4);
    expect(files.at(-1)).toEqual({
      name: "Stores7290055700007-000-20261101-000100.xml",
      url: `${BASE}20261101/Stores7290055700007-000-20261101-000100.xml`,
    });
    expect(pickFiles(files, 10, ["7290055700007"]).prices).toHaveLength(2);
  });

  it("throws when the page no longer carries the inline list", () => {
    expect(() => carrefourFiles("<html>maintenance</html>", BASE)).toThrow(/no `path` or `files`/);
  });
});

