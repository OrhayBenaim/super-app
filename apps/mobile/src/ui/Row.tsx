import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { I18nManager, View } from "react-native";
import { useTheme, type ColorName } from "@/theme";
import { Tap, type TapProps } from "./Tap";
import { Text } from "./Text";

export type RowProps = Partial<Omit<TapProps, "children">> & {
  title: string;
  titleColor?: ColorName;
  /** Second line in Subhead, Secondary Label. */
  detail?: string;
  /** Trailing value in Secondary Label (form rows). */
  value?: string;
  valueColor?: ColorName;
  /** Disclosure chevron: this row pushes or opens something. */
  chevron?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};

/** The standard 52pt list row. Pressable when it has onPress/onLongPress, static otherwise. */
export function Row({ title, titleColor = "label", detail, value, valueColor = "labelSecondary", chevron, leading, trailing, onPress, onLongPress, accessibilityLabel, ...rest }: RowProps) {
  const { colors, space, size } = useTheme();
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, gap: space[1], paddingVertical: space[4] }}>
        <Text color={titleColor} numberOfLines={2}>
          {title}
        </Text>
        {detail && (
          <Text variant="subhead" color="labelSecondary" numberOfLines={2}>
            {detail}
          </Text>
        )}
      </View>
      {value && (
        <Text color={valueColor} numberOfLines={1} style={{ flexShrink: 1, maxWidth: "60%" }}>
          {value}
        </Text>
      )}
      {trailing}
      {chevron && <ChevronRight size={18} color={colors.controlOutline} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />}
    </>
  );
  const style = { flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row, paddingHorizontal: space[5] } as const;
  if (!onPress && !onLongPress) return <View style={style}>{body}</View>;
  return (
    <Tap accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} onLongPress={onLongPress} scaleTo={1} style={style} {...rest}>
      {body}
    </Tap>
  );
}
