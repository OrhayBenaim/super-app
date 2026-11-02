import { tokens } from "./tokens";

export * from "./tokens";
export { google } from "./google";

export function useTheme() {
  const { color: colors, space, radius, size, font, motion, shadow } = tokens;
  return { colors, space, radius, size, font, motion, shadow };
}
