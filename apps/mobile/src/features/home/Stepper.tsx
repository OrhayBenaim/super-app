import { Minus, Plus } from "lucide-react-native";
import { View } from "react-native";
import { formatQuantity } from "@/features/items/labels";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { IconButton, Text } from "@/ui";
import type { CardView } from "./card";

/** The 44pt stepper (DESIGN.md "Stepper and Add / Update"): round Tint Soft − and +, the Quantity between them. */
export function Stepper({ view, onStep }: { view: CardView; onStep: (dir: 1 | -1) => void }) {
  const { colors, radius } = useTheme();
  const label = formatQuantity(view.quantity, view.soldBy, t);
  const round = { borderRadius: radius.full, backgroundColor: colors.tintSoft };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <IconButton icon={Minus} size={20} accessibilityLabel={`${t("quantity.less")}, ${label}`} analyticsName={Taps.quantityLess} disabled={!view.canLess} onPress={() => onStep(-1)} style={round} />
      <Text variant="headline" tabular accessibilityLiveRegion="polite">
        {label}
      </Text>
      <IconButton icon={Plus} size={20} accessibilityLabel={`${t("quantity.more")}, ${label}`} analyticsName={Taps.quantityMore} disabled={!view.canMore} onPress={() => onStep(1)} style={round} />
    </View>
  );
}
