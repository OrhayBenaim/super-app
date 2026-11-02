import type { ComponentProps } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { trackTap, type TapName } from "@/lib/analytics";
import { springs, tokens } from "@/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TapProps = Omit<PressableProps, "style"> & {
  accessibilityLabel: string;
  /** Sent with the tap event; pick or add one in `Taps` (@/lib/analytics). */
  analyticsName: TapName;
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
        trackTap(analyticsName);
        onPress(e);
      })}
      onLongPress={onLongPress && ((e) => {
        trackTap(analyticsName, { long: true });
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
