import * as Haptics from "expo-haptics";
import { ChevronDown } from "lucide-react-native";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import { RADII } from "./api";
import { fmt } from "./format";

/** Nav-bar pull-down for the search radius ("Up to 10 km ⌄"). */
export function RadiusMenu({ value, onChange }: { value: number; onChange: (km: number) => void }) {
  const { colors, space, size } = useTheme();
  const label = (km: number) => fmt(t("compare.upTo"), { km });
  const pick = (km: number) => {
    if (km === value) return;
    Haptics.selectionAsync();
    onChange(km);
  };
  const open = () => {
    // shortcut: system action sheet / alert stand in for the iOS pull-down menu; swap for a native menu (@expo/ui) if it feels off.
    if (Platform.OS === "ios") {
      const options = [...RADII.map((km) => (km === value ? `✓ ${label(km)}` : label(km))), t("common.cancel")];
      ActionSheetIOS.showActionSheetWithOptions({ title: t("compare.radiusLabel"), options, cancelButtonIndex: RADII.length }, (i) => i < RADII.length && pick(RADII[i]));
    } else {
      Alert.alert(t("compare.radiusLabel"), undefined, RADII.map((km) => ({ text: label(km), onPress: () => pick(km) })), { cancelable: true });
    }
  };
  return (
    <Tap
      accessibilityLabel={`${t("compare.radiusLabel")}: ${label(value)}`}
      accessibilityRole="button"
      analyticsName="compare.radiusLabel"
      onPress={open}
      hitSlop={8}
      style={{ flexDirection: "row", alignItems: "center", gap: space[1], minHeight: size.target }}
    >
      <ChevronDown size={18} color={colors.tint} strokeWidth={1.75} />
      <Text color="tint" tabular>
        {label(value)}
      </Text>
    </Tap>
  );
}
