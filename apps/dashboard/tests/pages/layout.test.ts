import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import tokens from "../../../../docs/design/tokens.json" with { type: "json" };
import { setup } from "../seam.ts";

const BADGES = ["ok", "failed", "warning", "interrupted", "running", "finished", "skipped", "requested", "ignored"];

describe("the shell", () => {
  it("has the top bar: every nav item with the current one marked, and the find field", async () => {
    const html = await (await setup().app.request("/")).text();
    for (const [href, text] of [["/", "Price syncs"], ["/chains", "Chains"], ["/stores", "Stores"], ["/products", "Products"], ["/groups", "Product groups"], ["/promotions", "Promotions"]])
      expect(html).toMatch(new RegExp(`<a href="${href}"[^>]*>${text}</a>`));
    expect(html).toContain('<a href="/" aria-current="page">Price syncs</a>');
    expect(html).toMatch(/<form[^>]*action="\/products"[^>]*>[\s\S]*name="q"[\s\S]*placeholder="Find a store, Product or barcode"/);
    expect(html).toContain('<link rel="stylesheet" href="/assets/dashboard.css" />');
  });
});

describe("the tokens stylesheet", () => {
  it("takes its colours from tokens.json and gives every badge state its own style", async () => {
    const res = await setup().app.request("/assets/dashboard.css");
    expect(res.headers.get("content-type")).toContain("text/css");
    const css = await res.text();
    expect(css).toContain(`--tint: ${tokens.color.tint};`);
    expect(css).toContain(`--danger: ${tokens.color.danger};`);
    const style = (kind: string) => css.match(new RegExp(`\\.badge-${kind} \\{([^}]*)\\}`))?.[1];
    const styles = BADGES.map(style);
    for (const [i, s] of styles.entries()) expect(s, BADGES[i]).toBeTruthy();
    expect(new Set(styles).size).toBe(BADGES.length);
  });

  it("is the only place a colour is written: no hex literal in the dashboard's source", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
    for (const file of files(join(import.meta.dirname, "../../src"))) expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![-\w])/);
  });
});
