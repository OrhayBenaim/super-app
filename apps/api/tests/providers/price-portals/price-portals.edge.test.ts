import { readFileSync } from "node:fs";
// QA edge cases for the pure helpers of price-portals.ts (no network).
import { describe, expect, it } from "vitest";
import { parseFileName, pickFiles } from "#/ingest/files.ts";
import { cookieHeader, csrfToken, shufersalLinks, storeCookies, type Jar } from "#/providers/price-portals/price-portals.ts";

const fixture = (name: string) => readFileSync(new URL(`../../__fixtures__/real/${name}`, import.meta.url), "utf8");

describe("cookie jar", () => {
  it("merges several Set-Cookie headers, strips every attribute, and lets a later value overwrite", () => {
    const jar: Jar = new Map();
    storeCookies(jar, [
      "cftpSID=abc123; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600; Domain=.publishedprices.co.il; Secure; HttpOnly; SameSite=None",
      "ARRAffinity=xyz; path=/",
      "empty=; Path=/",
    ]);
    expect(cookieHeader(jar)).toBe("cftpSID=abc123; ARRAffinity=xyz; empty=");
    storeCookies(jar, ["cftpSID=rotated; Path=/"]);
    storeCookies(jar, ["ARRAffinity=second", "cftpSID=final"]);
    expect(cookieHeader(jar)).toBe("cftpSID=final; ARRAffinity=second; empty=");
  });

  it("keeps '=' inside a value, trims spaces around name and value, and ignores junk without a name", () => {
    const jar: Jar = new Map();
    storeCookies(jar, ["token=a=b==; Path=/", " spaced = v ; Path=/", "novalue", "=nameless", ""]);
    expect(cookieHeader(jar)).toBe("token=a=b==; spaced=v");
  });

  it("an empty jar and an empty header list give an empty Cookie header", () => {
    const jar: Jar = new Map();
    storeCookies(jar, []);
    expect(cookieHeader(jar)).toBe("");
  });
});

describe("csrfToken", () => {
  it("extracts the token from the login page meta tag, with or without a self-closing slash", () => {
    expect(csrfToken('<head><meta name="csrftoken" content="EE-WCfA6t5q_TNC"></head>')).toBe("EE-WCfA6t5q_TNC");
    expect(csrfToken('<meta name="csrftoken" content="a/b+c=="/>')).toBe("a/b+c==");
  });
  it("is undefined when there is no token, an empty token, or an unrelated meta tag", () => {
    expect(csrfToken("")).toBeUndefined();
    expect(csrfToken('<meta name="csrftoken" content="">')).toBeUndefined();
    expect(csrfToken('<meta name="viewport" content="width=device-width">')).toBeUndefined();
  });
  it("takes the first token when a page carries two", () => {
    expect(csrfToken('<meta name="csrftoken" content="one"><meta name="csrftoken" content="two">')).toBe("one");
  });
});

describe("shufersalLinks", () => {
  const html = fixture("shufersal-list.html");

  it("on the captured page: unique PriceFull names, https blob URLs with a decoded query and no &amp;", () => {
    const links = shufersalLinks(html);
    expect(links.length).toBeGreaterThan(0);
    expect(new Set(links.map((l) => l.name)).size).toBe(links.length);
    for (const l of links) {
      expect(l.name).toMatch(/^PriceFull7290027600007-\d{3}-\d{3}-\d{8}-\d{6}\.gz$/);
      expect(l.url).toMatch(/^https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/.+\?sv=/);
      expect(l.url).not.toContain("&amp;");
      expect(l.url).toContain("sig=");
    }
    expect(links.every((l) => parseFileName(l.name)?.type === "pricefull")).toBe(true);
  });

  it("feeds pickFiles directly", () => {
    const { prices } = pickFiles(shufersalLinks(html), 2, ["7290027600007"]);
    expect(prices).toHaveLength(2);
  });

  it("takes a Stores link, skips paging/sort links and relative or http links, and a page with no rows gives []", () => {
    const stores = '<a href="https://pricesprodpublic.blob.core.windows.net/stores/Stores7290027600007-000-20261101-020.gz?sv=2014&amp;sr=b&amp;sig=abc%2Fdef&amp;se=2026&amp;sp=r">dl</a>';
    expect(shufersalLinks(stores)).toEqual([
      { name: "Stores7290027600007-000-20261101-020.gz", url: "https://pricesprodpublic.blob.core.windows.net/stores/Stores7290027600007-000-20261101-020.gz?sv=2014&sr=b&sig=abc%2Fdef&se=2026&sp=r" },
    ]);
    expect(shufersalLinks('<a href="/FileObject/UpdateCategory?catID=2&amp;page=2">2</a><a href="https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&amp;page=3">3</a>')).toEqual([]);
    expect(shufersalLinks('<a href="http://x/PriceFull1-001-001-20261101-000000.gz?sig=1">x</a>')).toEqual([]);
    expect(shufersalLinks("")).toEqual([]);
  });
});

