import { useColorScheme } from "react-native";
import { tokens, type Colors } from "./tokens";

export * from "./tokens";

export function useTheme() {
  const isDark = useColorScheme() === "dark";
  const colors: Colors = isDark ? tokens.color.dark : tokens.color.light;
  const { space, radius, font, motion, shadow } = tokens;
  return { colors, space, radius, font, motion, shadow, isDark };
}
