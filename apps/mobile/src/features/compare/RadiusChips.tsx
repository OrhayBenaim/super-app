import * as Haptics from "expo-haptics";
import { View } from "react-native";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import { RADII } from "./api";
import { fmt } from "./format";

export function RadiusChips({ value, onChange }: { value: number; onChange: (km: number) => void }) {
  const { colors, radius, space } = useTheme();
  return (
    <View accessibilityLabel={t("compare.radiusLabel")} style={{ flexDirection: "row", gap: space[3] }}>
      {RADII.map((km) => {
        const selected = km === value;
        const label = fmt(t("compare.km"), { km });
        return (
          <Tap
            key={km}
            accessibilityLabel={`${t("compare.radiusLabel")}: ${label}`}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync();
              onChange(km);
            }}
            hitSlop={6}
            style={{
              paddingHorizontal: space[5],
              minHeight: 32,
              justifyContent: "center",
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: selected ? colors.primarySoft : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surface,
            }}
          >
            <Text variant="subhead" tabular color={selected ? "onPrimarySoft" : "textSecondary"}>
              {label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}
