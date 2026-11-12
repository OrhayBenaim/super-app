import { WifiOff } from "lucide-react-native";
import { View } from "react-native";
import { useIsOnline } from "@/lib/online";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Text } from "./Text";

/** A quiet status under a screen's title while the phone is offline: edits are kept and sent later. Nothing when online. */
export function OfflineLine() {
  const { colors, space } = useTheme();
  if (useIsOnline()) return null;
  return (
    <View accessible accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingTop: space[1] }}>
      <WifiOff size={14} color={colors.labelSecondary} strokeWidth={1.75} />
      <Text variant="footnote" color="labelSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {t("offline.line")}
      </Text>
    </View>
  );
}
