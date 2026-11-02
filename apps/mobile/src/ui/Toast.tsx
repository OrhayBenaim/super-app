import { useEffect, useRef } from "react";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Button } from "./Button";
import { Text } from "./Text";

export type ToastProps = { message: string | null; action?: { title: string; analyticsName: string; onPress: () => void }; onHide: () => void };

/** Floating message near the bottom (e.g. delete + Undo); hides after motion.duration.toast. */
export function Toast({ message, action, onHide }: ToastProps) {
  const { colors, radius, space, shadow, motion } = useTheme();
  const hide = useRef(onHide);
  hide.current = onHide;
  // Restarts per message; pass a `key` to restart for a repeated message.
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => hide.current(), motion.duration.toast);
    return () => clearTimeout(id);
  }, [message, motion.duration.toast]);
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.duration.base)}
      exiting={FadeOut.duration(motion.duration.fast)}
      accessibilityLiveRegion="polite"
      style={[
        { position: "absolute", start: space[5], end: space[5], bottom: space[5], flexDirection: "row", alignItems: "center", gap: space[3], paddingStart: space[5], minHeight: 52, borderRadius: radius.group, backgroundColor: colors.elevated },
        shadow.sheet,
      ]}
    >
      <Text style={{ flex: 1 }} numberOfLines={2}>
        {message}
      </Text>
      {action && (
        <Button
          variant="plain"
          title={action.title}
          analyticsName={action.analyticsName}
          onPress={() => {
            action.onPress();
            onHide();
          }}
        />
      )}
    </Animated.View>
  );
}
