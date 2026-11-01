import type { LucideIcon } from "lucide-react-native";
import { X } from "lucide-react-native";
import { View } from "react-native";
import { t } from "@/lib/strings";
import { useTheme, type ColorName } from "@/theme";
import { Tap } from "./Tap";
import { Text } from "./Text";

type Tone = "neutral" | "primary" | "accent";
const look: Record<Tone, { bg: ColorName; fg: ColorName }> = {
  neutral: { bg: "surfaceSunken", fg: "textSecondary" },
  primary: { bg: "primarySoft", fg: "onPrimarySoft" },
  accent: { bg: "accentSoft", fg: "onAccentSoft" },
};

export type ChipProps = { label: string; tone?: Tone; icon?: LucideIcon; onClear?: () => void };

/** Small pill label. `onClear` adds a remove button (with a 44pt hit area). */
export function Chip({ label, tone = "neutral", icon: Icon, onClear }: ChipProps) {
  const { colors, radius, space } = useTheme();
  const { bg, fg } = look[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: space[2],
        paddingHorizontal: space[3],
        paddingVertical: space[1],
        borderRadius: radius.full,
        backgroundColor: colors[bg],
      }}
    >
      {Icon && <Icon size={14} color={colors[fg]} />}
      <Text variant="footnote" color={fg} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      {onClear && (
        <Tap accessibilityLabel={`${t("common.remove")} ${label}`} onPress={onClear} hitSlop={14} scaleTo={0.85}>
          <X size={14} color={colors[fg]} />
        </Tap>
      )}
    </View>
  );
}
