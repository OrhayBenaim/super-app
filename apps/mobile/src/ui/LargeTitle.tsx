import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Text } from "./Text";

export type LargeTitleProps = { title: string; subtitle?: string; /** Nav-bar items, shown at the trailing end. */ nav?: ReactNode };

/** Top-level screen header: nav bar items, the large title, one summary line. */
export function LargeTitle({ title, subtitle, nav }: LargeTitleProps) {
  const { space, size } = useTheme();
  return (
    <View style={{ paddingBottom: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space[2], minHeight: size.target }}>{nav}</View>
      <Text variant="largeTitle" accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {subtitle && (
        <Text variant="subhead" color="labelSecondary" numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
