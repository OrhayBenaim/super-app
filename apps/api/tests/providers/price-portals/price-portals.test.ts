import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cookieHeader, csrfToken, shufersalLinks, storeCookies, type Jar } from "#/providers/price-portals/price-portals.ts";

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

