import { Check } from "lucide-react-native";
import { View } from "react-native";
import { fmt } from "@/features/compare/format";
import { formatQuantity } from "@/features/items/labels";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Text } from "@/ui";
import type { CardView } from "./card";
import { Stepper } from "./Stepper";

/**
 * The stepper over the action (DESIGN.md): Add (tinted), "✓ on the List ×N" (status, not a button) while the stepper
 * equals the Item's Quantity, Update once it differs. `name` labels the action for screen readers.
 */
export function CardControls({ name, view, onStep, onAct }: { name: string; view: CardView; onStep: (dir: 1 | -1) => void; onAct: () => void }) {
  const { colors, space, size } = useTheme();
  const quantity = formatQuantity(view.quantity, view.soldBy, t);
  return (
    <View style={{ gap: space[3] }}>
      <Stepper view={view} onStep={onStep} />
      {view.action === "onList" ? (
        <View accessible style={{ minHeight: size.target, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2] }}>
          <Check size={18} color={colors.labelSecondary} strokeWidth={1.75} />
          <Text variant="subhead" color="labelSecondary" numberOfLines={1}>
            {fmt(t("home.onList"), { quantity })}
          </Text>
        </View>
      ) : (
        <Button
          variant="tinted"
          title={t(view.action === "add" ? "home.add" : "home.update")}
          accessibilityLabel={fmt(t(view.action === "add" ? "home.add.label" : "home.update.label"), { name, quantity })}
          analyticsName={view.action === "add" ? Taps.homeAdd : Taps.homeUpdate}
          onPress={onAct}
          style={{ minHeight: size.target, paddingHorizontal: space[3] }}
        />
      )}
    </View>
  );
}
