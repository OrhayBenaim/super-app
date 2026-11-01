import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { useTheme, type ColorName } from "@/theme";
import { Tap, type TapProps } from "./Tap";
import { Text } from "./Text";

/** filled: the screen's one primary action. tinted: secondary with weight. plain: text only. destructive: danger text. neutral: third-party sign-in on a white fill. */
type Variant = "filled" | "tinted" | "plain" | "destructive" | "neutral";

export type ButtonProps = Omit<TapProps, "accessibilityLabel" | "children"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string;
  /** Light impact on press; only for committing actions. */
  haptic?: boolean;
};

const look: Record<Variant, { bg: ColorName | null; fg: ColorName }> = {
  filled: { bg: "tint", fg: "tintOn" },
  tinted: { bg: "tintSoft", fg: "tint" },
  plain: { bg: null, fg: "tint" },
  destructive: { bg: null, fg: "danger" },
  neutral: { bg: "surface", fg: "label" },
};

export function Button({ title, variant = "filled", loading, icon: Icon, disabled, onPress, style, accessibilityLabel, haptic = false, ...rest }: ButtonProps) {
  const { colors, radius, space, size } = useTheme();
  const { bg, fg } = look[variant];
  const off = disabled || loading;

  return (
    <Tap
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={[
        {
          minHeight: size.button,
          paddingHorizontal: space[6],
          borderRadius: radius.button,
          backgroundColor: bg ? colors[bg] : "transparent",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {/* Label stays laid out while loading so the button never changes size. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], opacity: loading ? 0 : 1 }}>
        {Icon && <Icon size={20} color={colors[fg]} strokeWidth={1.75} />}
        <Text variant={variant === "destructive" ? "body" : "headline"} color={fg} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {loading && <ActivityIndicator color={colors[fg]} style={{ position: "absolute" }} />}
    </Tap>
  );
}
