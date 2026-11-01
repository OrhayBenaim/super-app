import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { useTheme, type ColorName } from "@/theme";
import { Tap, type TapProps } from "./Tap";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "ghost";

export type ButtonProps = Omit<TapProps, "accessibilityLabel" | "children"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string;
};

const look: Record<Variant, { bg: ColorName | null; fg: ColorName }> = {
  primary: { bg: "primary", fg: "onPrimary" },
  secondary: { bg: "primarySoft", fg: "onPrimarySoft" },
  ghost: { bg: null, fg: "primary" },
};

export function Button({ title, variant = "primary", loading, icon: Icon, disabled, onPress, style, accessibilityLabel, ...rest }: ButtonProps) {
  const { colors, radius, space } = useTheme();
  const { bg, fg } = look[variant];
  const off = disabled || loading;

  return (
    <Tap
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={[
        {
          minHeight: 52,
          paddingHorizontal: space[7],
          borderRadius: radius.md,
          backgroundColor: bg ? colors[bg] : "transparent",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {/* Label stays laid out while loading so the button never changes size. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], opacity: loading ? 0 : 1 }}>
        {Icon && <Icon size={20} color={colors[fg]} />}
        <Text variant="headline" color={fg} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {loading && <ActivityIndicator color={colors[fg]} style={{ position: "absolute" }} />}
    </Tap>
  );
}
