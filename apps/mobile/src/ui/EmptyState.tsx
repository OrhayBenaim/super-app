import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Button } from "./Button";
import { Text } from "./Text";

export type EmptyStateProps = {
  title: string;
  body?: string;
  icon?: LucideIcon;
  /** `filled` when it is the screen's one primary action (e.g. allow location); tinted otherwise. */
  action?: { title: string; onPress: () => unknown; filled?: boolean };
};

export function EmptyState({ title, body, icon: Icon, action }: EmptyStateProps) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space[4], paddingHorizontal: space[7], paddingVertical: space[10] }}>
      {Icon && <Icon size={36} color={colors.labelSecondary} strokeWidth={1.75} />}
      <Text variant="title2" accessibilityRole="header" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body && (
        <Text variant="callout" color="labelSecondary" style={{ textAlign: "center" }}>
          {body}
        </Text>
      )}
      {action && <Button title={action.title} variant={action.filled ? "filled" : "tinted"} onPress={action.onPress} style={{ marginTop: space[3], minWidth: 200 }} />}
    </View>
  );
}
