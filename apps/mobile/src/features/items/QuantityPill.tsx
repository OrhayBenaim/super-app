import { useRouter } from "expo-router";
import { View } from "react-native";
import { fmt } from "@/features/compare/format";
import type { Item } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import { formatQuantity, type ListScreen } from "./labels";

/** The item's Quantity ("×2", "500 g") at the end of a List or My items row; opens the Quantity sheet. 44pt target. */
export function QuantityPill({ item, screen }: { item: Item; screen: ListScreen }) {
  const router = useRouter();
  const { colors, space, size, radius } = useTheme();
  const label = formatQuantity(item.quantity, item.soldBy, t);
  return (
    <Tap
      accessibilityLabel={`${fmt(t("quantity.label"), { quantity: label })}, ${item.name}`}
      accessibilityHint={t("quantity.hint")}
      analyticsName={screen === "list" ? Taps.listQuantity : Taps.itemsQuantity}
      onPress={() => router.push({ pathname: "/quantity/[id]", params: { id: item.id, from: screen } })}
      scaleTo={0.94}
      style={{ minWidth: size.target, minHeight: size.target, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ minWidth: 30, height: 30, paddingHorizontal: space[3], borderRadius: radius.control, backgroundColor: colors.tintSoft, alignItems: "center", justifyContent: "center" }}>
        <Text variant="subhead" color="tint" tabular style={{ fontWeight: "600" }}>
          {label}
        </Text>
      </View>
    </Tap>
  );
}
