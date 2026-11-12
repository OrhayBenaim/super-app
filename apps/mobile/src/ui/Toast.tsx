import { useEffect, useRef } from "react";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useTheme } from "@/theme";
import type { TapName } from "@/lib/analytics";
import { Button } from "./Button";
import { Text } from "./Text";

export type ToastProps = {
  message: string | null;
  action?: { title: string; analyticsName: TapName; onPress: () => void };
  /** Sits one toast higher, for a toast that can show together with another (e.g. "Couldn't save" over delete + Undo). */
  above?: boolean;
  onHide: () => void;
};

/** Floating message near the bottom (e.g. delete + Undo); hides after motion.duration.toast. */
export function Toast({ message, action, above, onHide }: ToastProps) {
  const { colors, radius, space, size, shadow, motion } = useTheme();
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
        { position: "absolute", start: space[5], end: space[5], bottom: above ? space[5] + size.row + space[3] : space[5], flexDirection: "row", alignItems: "center", gap: space[3], paddingStart: space[5], minHeight: size.row, borderRadius: radius.group, backgroundColor: colors.elevated },
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
