import { expect, it } from "vitest";
import { springs, text, tokens } from "@/theme/tokens";

it("derives every spring from motion.spring tokens", () => {
  for (const [name, s] of Object.entries(tokens.motion.spring)) {
    expect(springs[name as keyof typeof springs]).toEqual({ damping: s.damping, stiffness: s.stiffness, mass: s.mass });
  }
});

it("has a complete type scale", () => {
  const { size, lineHeight, letterSpacing } = tokens.font;
  expect(Object.keys(lineHeight)).toEqual(Object.keys(size));
  expect(Object.keys(letterSpacing)).toEqual(Object.keys(size));
  expect(text("body")).toEqual({ fontSize: 17, lineHeight: 22, letterSpacing: -0.4, fontWeight: "400" });
  expect(text("largeTitle").fontWeight).toBe("700");
  expect(text("priceHero")).toMatchObject({ fontSize: 40, fontWeight: "700", fontVariant: ["tabular-nums"] });
});

it("light and dark palettes have the same colors", () => {
  expect(Object.keys(tokens.color.dark)).toEqual(Object.keys(tokens.color.light));
});
