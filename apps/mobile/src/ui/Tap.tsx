import type { ComponentProps } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { track } from "@/lib/analytics";
import { springs, tokens } from "@/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TapProps = Omit<PressableProps, "style"> & {
  accessibilityLabel: string;
  /** Sent with the tap event: stable and language-neutral, never user data (use the action's strings key, e.g. "compare.navigate"). */
  analyticsName: string;
  style?: StyleProp<ViewStyle>;
  layout?: ComponentProps<typeof Animated.View>["layout"];
  /** Press-in scale; defaults to tokens.motion.scale.press. */
  scaleTo?: number;
};

/** Pressable with spring press feedback. Scale fires on press-in so it reads instantly. */
export function Tap({ style, onPressIn, onPressOut, onPress, onLongPress, analyticsName, scaleTo = tokens.motion.scale.press, disabled, ...rest }: TapProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      pressRetentionOffset={16}
      disabled={disabled}
      {...rest}
      onPress={onPress && ((e) => {
        track("tap", { name: analyticsName });
        onPress(e);
      })}
      onLongPress={onLongPress && ((e) => {
        track("tap", { name: analyticsName, long: true });
        onLongPress(e);
      })}
      onPressIn={(e) => {
        if (!reduced) scale.set(withSpring(scaleTo, springs.snappy));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, springs.snappy));
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
