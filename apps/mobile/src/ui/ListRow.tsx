import { Check } from "lucide-react-native";
import type { TapName } from "@/lib/analytics";
import { useTheme } from "@/theme";
import { Row } from "./Row";

/** A List to pick: its name, an optional detail (member count) and a Tint check on the selected one. */
export function ListRow({ name, detail, selected, analyticsName, onPress }: { name: string; detail?: string; selected: boolean; analyticsName: TapName; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Row
      title={name}
      value={detail}
      accessibilityLabel={detail ? `${name}, ${detail}` : name}
      accessibilityState={{ selected }}
      trailing={selected ? <Check size={20} color={colors.tint} strokeWidth={2} /> : undefined}
      analyticsName={analyticsName}
      onPress={onPress}
    />
  );
}
