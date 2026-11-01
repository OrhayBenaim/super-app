import type { LucideIcon } from "lucide-react-native";
import { Search } from "lucide-react-native";
import type { Ref } from "react";
import { I18nManager, TextInput, View, type TextInputInstance, type TextInputProps, type ViewStyle } from "react-native";
import { text, useTheme } from "@/theme";

export type SearchFieldProps = TextInputProps & {
  label: string;
  ref?: Ref<TextInputInstance>;
  icon?: LucideIcon;
  containerStyle?: ViewStyle;
};

/** Control Fill field, 10pt radius, leading icon in Secondary Label. `label` is the placeholder and the accessibility label. */
export function SearchField({ label, ref, icon: Icon = Search, containerStyle, style, ...rest }: SearchFieldProps) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      style={[{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 36, paddingHorizontal: space[4], borderRadius: radius.control, backgroundColor: colors.fillControl }, containerStyle]}
    >
      <Icon size={18} color={colors.labelSecondary} strokeWidth={1.75} />
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors.labelSecondary}
        selectionColor={colors.tint}
        clearButtonMode="while-editing"
        style={[text("body"), { flex: 1, color: colors.label, paddingVertical: space[3], textAlign: I18nManager.isRTL ? "right" : "left" }, style]}
        {...rest}
      />
    </View>
  );
}
