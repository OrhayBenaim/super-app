import { I18nManager, Text as RNText, type TextProps as RNTextProps } from "react-native";
import { text, useTheme, type ColorName, type TextVariant } from "@/theme";

export type TextProps = RNTextProps & { variant?: TextVariant; color?: ColorName; tabular?: boolean };

export function Text({ variant = "body", color = "label", tabular, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        text(variant),
        { color: colors[color], writingDirection: I18nManager.isRTL ? "rtl" : "ltr" },
        tabular && { fontVariant: ["tabular-nums"] },
        style,
      ]}
      {...rest}
    />
  );
}
