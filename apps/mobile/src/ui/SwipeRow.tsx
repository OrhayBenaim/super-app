import * as Haptics from "expo-haptics";
import { Trash2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { I18nManager, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { springs, useTheme } from "@/theme";
import { Text } from "./Text";

export type SwipeRowProps = {
  children: ReactNode;
  onDelete: () => void;
  /** Visible action label and the screen-reader action that does the same as the swipe. */
  label: string;
};

// The further past the edge, the less the row follows.
function rubberband(overshoot: number, dimension: number) {
  "worklet";
  return (overshoot * dimension * 0.55) / (dimension + 0.55 * Math.abs(overshoot));
}

/** iOS trailing swipe-to-delete: the row travels toward the leading edge, the red action shows at the trailing edge; past commitFraction (or a flick) it deletes. */
export function SwipeRow({ children, onDelete, label }: SwipeRowProps) {
  const { colors, space, motion } = useTheme();
  const { commitFraction, commitVelocity, activeOffsetX, failOffsetY, maxFraction } = motion.swipe;
  // Travel toward the leading edge; transforms are not mirrored in RTL, so map it to a screen sign.
  const sign = I18nManager.isRTL ? 1 : -1;
  const reduced = useReducedMotion();
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
      if (commit) scheduleOnRN(onDelete);
    },
  });

  // One light tap when the swipe first arms (the "drag commits" moment), not per frame.
  useAnimatedReaction(
    () => armed.get(),
    (now, prev) => {
      if (now && !prev) scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Light);
    },
  );

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.get()), [0, 24], [0, 1], "clamp") }));
  const actionStyle = useAnimatedStyle(() => ({
    opacity: armed.get() ? 1 : 0.7,
    // Reduced motion: the opacity step still shows "armed"; drop the bouncy scale.
    transform: [{ scale: reduced ? 1 : withSpring(armed.get() ? 1 : 0.85, springs.bouncy) }],
  }));

  return (
    <View onLayout={(e) => width.set(e.nativeEvent.layout.width || 1)} accessibilityActions={[{ name: "delete", label }]} onAccessibilityAction={onDelete}>
      <Animated.View
        style={[
          { position: "absolute", top: 0, bottom: 0, start: 0, end: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: space[6], backgroundColor: colors.danger },
          bgStyle,
        ]}
      >
        <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: space[3] }, actionStyle]}>
          <Trash2 size={20} color={colors.onDanger} strokeWidth={1.75} />
          <Text variant="headline" color="onDanger">
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: colors.surface }, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
