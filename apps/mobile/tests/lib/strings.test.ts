import { expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "he" }] }));

it("en and he have the same keys, all non-empty", async () => {
  const { en, he } = await import("@/lib/strings");
  expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
  expect(Object.values(he).every(Boolean)).toBe(true);
});

it("t() picks the device language", async () => {
  const { t, he } = await import("@/lib/strings");
  expect(t("common.next")).toBe(he["common.next"]);
});
