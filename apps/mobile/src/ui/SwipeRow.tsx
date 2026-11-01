import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { I18nManager, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { springs, useTheme, type ColorName } from "@/theme";

export type SwipeRowProps = {
  children: ReactNode;
  /** Direction the row travels to commit ("end" = right in LTR, left in RTL). */
  to: "start" | "end";
  onCommit: () => void;
  color: ColorName;
  icon: LucideIcon;
  /** Screen-reader action that does the same as the swipe. */
  actionLabel: string;
};

// The further past the edge, the less the row follows.
function rubberband(overshoot: number, dimension: number) {
  "worklet";
  return (overshoot * dimension * 0.55) / (dimension + 0.55 * Math.abs(overshoot));
}

/** Swipe-to-commit row: past motion.swipe.commitFraction (or a flick) it calls onCommit and springs home. */
export function SwipeRow({ children, to, onCommit, color, icon: Icon, actionLabel }: SwipeRowProps) {
  const { colors, space, motion } = useTheme();
  const { commitFraction, commitVelocity, activeOffsetX, failOffsetY, maxFraction } = motion.swipe;
  // Transforms are not mirrored in RTL, so map start/end to a screen sign.
  const sign = (to === "end" ? 1 : -1) * (I18nManager.isRTL ? -1 : 1);
  const x = useSharedValue(0);
  const origin = useSharedValue(0);
  const width = useSharedValue(1);
  const armed = useSharedValue(false);

  const pan = usePanGesture({
    activeOffsetX: [-activeOffsetX, activeOffsetX],
    failOffsetY: [-failOffsetY, failOffsetY],
    onActivate: () => {
      "worklet";
      origin.set(x.get());
    },
    onUpdate: (e) => {
      "worklet";
      const w = width.get();
      const d = Math.max(0, sign * (origin.get() + e.translationX));
      const max = w * maxFraction;
      const travel = d > max ? max + rubberband(d - max, w) : d;
      x.set(sign * travel);
      armed.set(travel >= w * commitFraction);
    },
    onDeactivate: (e) => {
      "worklet";
      const commit = !e.canceled && (armed.get() || sign * e.velocityX > commitVelocity);
      x.set(withSpring(0, { ...springs.snappy, velocity: e.velocityX }));
      armed.set(false);
      if (commit) scheduleOnRN(onCommit);
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.get()), [0, 24], [0, 1], "clamp") }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: armed.get() ? 1 : 0.6,
    transform: [{ scale: withSpring(armed.get() ? 1 : 0.6, springs.bouncy) }],
  }));

  return (
    <View
      onLayout={(e) => width.set(e.nativeEvent.layout.width || 1)}
      accessibilityActions={[{ name: "commit", label: actionLabel }]}
      onAccessibilityAction={onCommit}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            start: 0,
            end: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: to === "end" ? "flex-start" : "flex-end",
            paddingHorizontal: space[7],
            backgroundColor: colors[color],
          },
          bgStyle,
        ]}
      >
        <Animated.View style={iconStyle}>
          <Icon size={24} color={colors.onPrimary} strokeWidth={2.5} />
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: colors.surface }, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
