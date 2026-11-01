import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { ChartColumn, ListChecks, Settings, ShoppingBasket, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { I18nManager, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { springs, useTheme } from "@/theme";
import { Text } from "@/ui";

const ICONS: Record<string, LucideIcon> = { index: ListChecks, items: ShoppingBasket, compare: ChartColumn, settings: Settings };
const PILL_W = 56;
const PILL_H = 32;

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, space } = useTheme();
  const reduced = useReducedMotion();
  const [tabWidth, setTabWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (!tabWidth) return;
    // Absolute pill anchored at `start`; RTL flips the row, so flip the travel direction too.
    const target = (I18nManager.isRTL ? -1 : 1) * (state.index * tabWidth + (tabWidth - PILL_W) / 2);
    x.set(reduced || x.get() === 0 ? target : withSpring(target, springs.snappy));
  }, [state.index, tabWidth, reduced, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setTabWidth(e.nativeEvent.layout.width / state.routes.length)}
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingTop: space[3],
        paddingBottom: Math.max(insets.bottom, space[3]),
      }}
    >
      {tabWidth > 0 && (
        <Animated.View
          style={[{ position: "absolute", top: space[3], start: 0, width: PILL_W, height: PILL_H, borderRadius: PILL_H / 2, backgroundColor: colors.primarySoft }, pill]}
        />
      )}
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const label = descriptors[route.key].options.title ?? route.name;
        const onPress = () => {
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
            style={{ flex: 1, alignItems: "center", gap: space[2], minHeight: 44 }}
          >
            <TabIcon icon={ICONS[route.name] ?? ListChecks} focused={focused} />
            <Text variant="caption" color={focused ? "onPrimarySoft" : "textSecondary"} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ icon: Icon, focused }: { icon: LucideIcon; focused: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.set(reduced ? 1 : withSpring(focused ? 1.1 : 1, springs.snappy));
  }, [focused, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={[{ height: PILL_H, justifyContent: "center" }, style]}>
      <Icon size={22} color={focused ? colors.onPrimarySoft : colors.textSecondary} />
    </Animated.View>
  );
}
