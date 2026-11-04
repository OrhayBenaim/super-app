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

const BUTTONS = {
  add: { title: "home.add", label: "home.add.label", tap: Taps.homeAdd },
  update: { title: "home.update", label: "home.update.label", tap: Taps.homeUpdate },
  switch: { title: "home.switch", label: "home.switch.label", tap: Taps.homeSwitch },
} as const;

/**
 * The stepper over the action (DESIGN.md): Add (tinted), "✓ on the List ×N" (status, not a button) while the stepper
 * equals the Item's Quantity, Update once it differs, "switch to this" on a product page's other Products. `name`
 * labels the action for screen readers. `row` puts the 150pt stepper beside the action (product pages).
 */
export function CardControls({ name, view, onStep, onAct, row = false }: { name: string; view: CardView; onStep: (dir: 1 | -1) => void; onAct: () => void; row?: boolean }) {
  const { colors, space, size } = useTheme();
  const quantity = formatQuantity(view.quantity, view.soldBy, t);
  const button = view.action === "onList" ? null : BUTTONS[view.action];
  return (
    <View style={row ? { flexDirection: "row", alignItems: "center", gap: space[4] } : { gap: space[3] }}>
      <View style={row ? { width: 150 } : undefined}>
        <Stepper view={view} onStep={onStep} />
      </View>
      {!button ? (
        <View accessible style={{ flex: row ? 1 : undefined, minHeight: size.target, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2] }}>
          <Check size={18} color={colors.labelSecondary} strokeWidth={1.75} />
          <Text variant="subhead" color="labelSecondary" numberOfLines={1}>
            {fmt(t("home.onList"), { quantity })}
          </Text>
        </View>
      ) : (
        <Button
          variant="tinted"
          title={t(button.title)}
          accessibilityLabel={fmt(t(button.label), { name, quantity })}
          analyticsName={button.tap}
          onPress={onAct}
          style={{ flex: row ? 1 : undefined, minHeight: size.target, paddingHorizontal: space[3] }}
        />
      )}
    </View>
  );
}
