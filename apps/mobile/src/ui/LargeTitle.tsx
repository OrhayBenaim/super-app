import { ChevronDown } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { TapName } from "@/lib/analytics";
import { useTheme } from "@/theme";
import { Tap } from "./Tap";
import { Text } from "./Text";

/** Makes the title a pull-down: a Tint chevron after it, and `hint` says what a tap opens. */
type TitleMenu = { hint: string; analyticsName: TapName; onPress: () => void };

export type LargeTitleProps = { title: string; subtitle?: string; /** Nav-bar items, shown at the trailing end. */ nav?: ReactNode; /** Nav-bar item at the start corner (the drawer menu icon). */ start?: ReactNode; menu?: TitleMenu; /** Under the summary line (the offline line). */ status?: ReactNode };

/** Top-level screen header: nav bar items, the large title (optionally a pull-down), one summary line. */
export function LargeTitle({ title, subtitle, nav, start, menu, status }: LargeTitleProps) {
  const { colors, space, size } = useTheme();
  const heading = (
    // flexShrink lets a long title truncate while the chevron keeps its place.
    <Text variant="largeTitle" accessibilityRole={menu ? undefined : "header"} numberOfLines={1} style={{ flexShrink: 1 }}>
      {title}
    </Text>
  );
  return (
    <View style={{ paddingBottom: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: size.target }}>
        {start}
        <View style={{ flex: 1 }} />
        {nav}
      </View>
      {menu ? (
        // Still the screen's heading for screen readers; it stays activatable, and the hint says what a tap opens.
        <Tap
          accessibilityRole="header"
          accessibilityLabel={title}
          accessibilityHint={menu.hint}
          analyticsName={menu.analyticsName}
          onPress={menu.onPress}
          style={{ flexDirection: "row", alignItems: "center", gap: space[2], alignSelf: "flex-start", maxWidth: "100%" }}
        >
          {heading}
          <ChevronDown size={18} color={colors.tint} strokeWidth={1.75} />
        </Tap>
      ) : (
        heading
      )}
      {subtitle && (
        <Text variant="subhead" color="labelSecondary" numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      {status}
    </View>
  );
}
