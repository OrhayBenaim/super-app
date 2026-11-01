import { View } from "react-native";
import { useTheme } from "@/theme";
import { Button } from "./Button";
import { Text } from "./Text";

export type EmptyStateProps = { title: string; body?: string; action?: { title: string; onPress: () => void } };

export function EmptyState({ title, body, action }: EmptyStateProps) {
  const { space } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space[4], paddingHorizontal: space[7], paddingVertical: space[10] }}>
      <Text variant="title2" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body && (
        <Text variant="callout" color="textSecondary" style={{ textAlign: "center" }}>
          {body}
        </Text>
      )}
      {action && <Button title={action.title} variant="secondary" onPress={action.onPress} style={{ marginTop: space[4] }} />}
    </View>
  );
}
