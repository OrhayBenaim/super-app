import type { useTheme } from "@/theme";

/** A page pushed inside a tab: the native header, untitled, in the tint over the grouped background. */
export const pushedHeader = (colors: ReturnType<typeof useTheme>["colors"]) =>
  ({ headerShown: true, title: "", headerTintColor: colors.tint, headerShadowVisible: false, headerStyle: { backgroundColor: colors.groupedBg } }) as const;
