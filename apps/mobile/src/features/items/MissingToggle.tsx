import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { I18nManager, Pressable } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { springs, useTheme } from "@/theme";

const W = 52;
const H = 32;
const THUMB = 26;

/** The "missing" switch: on = the item is on the shopping list. Springs with springs.bouncy. */
export function MissingToggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors, shadow } = useTheme();
  const reduced = useReducedMotion();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.set(reduced ? (value ? 1 : 0) : withSpring(value ? 1 : 0, springs.bouncy));
  }, [value, reduced, on]);

  const travel = (W - THUMB - 6) * (I18nManager.isRTL ? -1 : 1);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], [colors.surfaceSunken, colors.primary]),
    borderColor: interpolateColor(on.get(), [0, 1], [colors.borderControl, colors.primary]),
  }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: on.get() * travel }, { scale: 1 + 0.08 * Math.sin(on.get() * Math.PI) }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(!value);
      }}
    >
      <Animated.View style={[{ width: W, height: H, borderRadius: H / 2, borderWidth: 1.5, justifyContent: "center", paddingHorizontal: 1.5 }, track]}>
        <Animated.View style={[{ width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.surface, ...shadow.sm }, thumb]} />
      </Animated.View>
    </Pressable>
  );
}
