import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring } from "react-native-reanimated";
import { springs, useTheme } from "@/theme";

/** A rounded placeholder box for content still loading, hidden from assistive tech. Pulses gently; still under reduced motion. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(withSpring(0.5, springs.gentle), -1, true);
    return () => {
      cancelAnimation(opacity);
      opacity.value = 1;
    };
  }, [reduced]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ backgroundColor: colors.fillControl, borderRadius: radius.control }, style, pulse]}
    />
  );
}
