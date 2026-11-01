import { ChevronDown } from "lucide-react-native";
import { I18nManager, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Tap } from "./Tap";
import { Text } from "./Text";

export type CategoryHeaderProps = { title: string; count: number; open?: boolean; onToggle?: () => void };

/** Section title with a count; with `onToggle` it collapses and the chevron rotates. */
export function CategoryHeader({ title, count, open = true, onToggle }: CategoryHeaderProps) {
  const { colors, space, motion } = useTheme();
  const reduced = useReducedMotion();
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingTop: space[6], paddingBottom: space[3] }}>
      {onToggle && (
        <Animated.View
          style={{
            // Collapsed points toward the reading direction's end.
            transform: [{ rotate: open ? "0deg" : I18nManager.isRTL ? "90deg" : "-90deg" }],
            transitionProperty: "transform",
            transitionDuration: reduced ? 0 : motion.duration.base,
          }}
        >
          <ChevronDown size={18} color={colors.textSecondary} />
        </Animated.View>
      )}
      <Text variant="subhead" color="textSecondary" accessibilityRole="header" style={{ flex: 1, fontWeight: "600" }} numberOfLines={1}>
        {title}
      </Text>
      <Text variant="footnote" color="textTertiary" tabular>
        {count}
      </Text>
    </View>
  );
  if (!onToggle) return body;
  return (
    <Tap accessibilityLabel={`${title}, ${count}`} accessibilityState={{ expanded: open }} onPress={onToggle} scaleTo={1}>
      {body}
    </Tap>
  );
}
