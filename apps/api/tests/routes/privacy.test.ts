import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

describe("GET /privacy", () => {
  it("serves the public Hebrew-first privacy policy as HTML, no sign-in needed", async () => {
    const res = await createApp(buildDeps(loadConfig())).request("/privacy");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    const page = await res.text();
    expect(page).toContain('<html lang="he" dir="rtl">');
    expect(page.indexOf('<article id="he">')).toBeLessThan(page.indexOf('<article id="en" lang="en" dir="ltr">'));
    for (const vendor of ["Sentry", "PostHog", "Resend"]) expect(page).toContain(vendor);
    expect(page).toContain("mailto:privacy@otterstory.club");
    // Both sections link the deletion page at both of its Data safety URLs.
    for (const href of ['href="/delete-account"', 'href="/delete-data"']) expect(page.split(href)).toHaveLength(3);
  });

  it("is rate limited like every route", async () => {
    const app = createApp(buildDeps(loadConfig()));
    const env = { incoming: { socket: { remoteAddress: "203.0.113.9" } } };
    const statuses = [];
    for (let i = 0; i < 301; i++) statuses.push((await app.request("/privacy", {}, env)).status);
    expect(statuses.at(-2)).toBe(200);
    expect(statuses.at(-1)).toBe(429);
  });
});
