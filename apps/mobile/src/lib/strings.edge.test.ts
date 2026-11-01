import { afterEach, describe, expect, it, vi } from "vitest";

const hebrew = /[֐-׿]/;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
// Brand / proper nouns / symbols that legitimately stay identical across languages.
const allowSame = /^(Apple|Google|Waze|₪)$/;

async function load(languageCode?: string) {
  vi.resetModules();
  vi.doMock("expo-localization", () => ({ getLocales: () => (languageCode ? [{ languageCode }] : []) }));
  return import("./strings");
}
afterEach(() => vi.doUnmock("expo-localization"));

describe("string tables", () => {
  it("same key set, no empty or whitespace-only values, no stray whitespace at the ends", async () => {
    const { en, he } = await load("en");
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of [...Object.entries(en), ...Object.entries(he)]) {
      expect(v.trim(), k).not.toBe("");
      expect(v, k).toBe(v.trim());
    }
  });

  it("placeholders ({n}, {name}, ...) are identical per key in both languages", async () => {
    const { en, he } = await load("en");
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(placeholders(he[k]), k).toEqual(placeholders(en[k]));
    // sanity: the parity check is not vacuous
    expect(placeholders(en["compare.has"])).toEqual(["m", "n"]);
  });

  it("no unbalanced braces", async () => {
    const { en, he } = await load("en");
    for (const [k, v] of [...Object.entries(en), ...Object.entries(he)]) {
      expect((v.match(/\{/g) ?? []).length, k).toBe((v.match(/\}/g) ?? []).length);
    }
  });

  it("he values are translated: contain Hebrew letters, unless a brand/symbol", async () => {
    const { en, he } = await load("en");
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      if (en[k] === he[k]) expect(en[k], `${k} untranslated`).toMatch(allowSame);
      else expect(he[k], k).toMatch(hebrew);
    }
  });

  it("en values contain no Hebrew", async () => {
    const { en } = await load("en");
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toMatch(hebrew);
  });

  it("he does not use ASCII double quotes inside Hebrew words (should be gershayim ״)", async () => {
    const { he } = await load("en");
    for (const [k, v] of Object.entries(he)) expect(v, k).not.toMatch(/[֐-׿]"[֐-׿]/);
  });

  it("price placeholder keeps ₪ in both languages for the nearby notification", async () => {
    const { en, he } = await load("en");
    expect(en["nearby.body"]).toContain("₪{total}");
    expect(he["nearby.body"]).toContain("₪{total}");
  });

  it("key naming: dot-separated, no spaces", async () => {
    const { en } = await load("en");
    for (const k of Object.keys(en)) expect(k).toMatch(/^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$/);
  });
});

describe("t()", () => {
  it("returns Hebrew for 'he', English for 'en', and falls back to English for other/missing locales", async () => {
    const he = await load("he");
    expect(he.t("common.next")).toBe(he.he["common.next"]);
    const en = await load("en");
    expect(en.t("common.next")).toBe("Next");
    const fr = await load("fr");
    expect(fr.t("common.next")).toBe("Next");
    const none = await load(undefined);
    expect(none.t("common.next")).toBe("Next");
  });
});
