import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { ChartColumn, ListChecks, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Taps, trackTap, type TapName } from "@/lib/analytics";
import { useTheme } from "@/theme";
import { Text } from "@/ui";

const ICONS: Record<string, LucideIcon> = { index: ListChecks, compare: ChartColumn };
const TAPS: Record<string, TapName> = { index: Taps.tabIndex, compare: Taps.tabCompare };

/** Standard iOS tab bar: Lucide icon over a Caption label; selected = tint, others Secondary Label; top hairline. */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, space, size } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        // shortcut: solid surface; iOS draws it at 85% with a blur, which needs expo-blur. Add it if the flat bar looks off on device.
        backgroundColor: colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.separator,
        paddingTop: space[2],
        paddingBottom: Math.max(insets.bottom, space[3]),
      }}
    >
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const label = descriptors[route.key].options.title ?? route.name;
        const Icon = ICONS[route.name] ?? ListChecks;
        const color = focused ? colors.tint : colors.labelSecondary;
        const onPress = () => {
          const tap = TAPS[route.name];
          if (tap) trackTap(tap);
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (focused || event.defaultPrevented) return;
          Haptics.selectionAsync();
          navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
            style={{ flex: 1, alignItems: "center", gap: space[1], minHeight: size.target }}
          >
            <Icon size={24} color={color} strokeWidth={1.75} />
            <Text variant="caption" style={{ color }} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
