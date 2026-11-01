// Pure token module (no React Native imports) so vitest can load it. Source: docs/design/tokens.json.
import tokens from "../../../../docs/design/tokens.json";

export { tokens };

export type ColorName = keyof typeof tokens.color.light;
export type Colors = Record<ColorName, string>;
export type TextVariant = keyof typeof tokens.font.size;
type Weight = "400" | "500" | "600" | "700";

type SpringName = keyof typeof tokens.motion.spring;
export type Spring = { damping: number; stiffness: number; mass: number };

/** withSpring configs, e.g. `withSpring(1, springs.snappy)`. */
export const springs = Object.fromEntries(
  Object.entries(tokens.motion.spring).map(([name, s]) => [name, { damping: s.damping, stiffness: s.stiffness, mass: s.mass }]),
) as Record<SpringName, Spring>;

const weightOf: Partial<Record<TextVariant, keyof typeof tokens.font.weight>> = {
  largeTitle: "bold",
  title1: "bold",
  title2: "bold",
  title3: "semibold",
  headline: "semibold",
};

/** Type-scale style for a variant: `text("headline")`. */
export function text(variant: TextVariant) {
  const { size, lineHeight, letterSpacing, weight } = tokens.font;
  return {
    fontSize: size[variant],
    lineHeight: lineHeight[variant],
    letterSpacing: letterSpacing[variant],
    fontWeight: weight[weightOf[variant] ?? "regular"] as Weight,
  };
}
