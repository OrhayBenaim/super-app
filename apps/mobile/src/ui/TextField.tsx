import { Eye, EyeOff } from "lucide-react-native";
import { useState, type Ref } from "react";
import { I18nManager, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { text, useTheme } from "@/theme";
import { IconButton } from "./IconButton";

export type TextFieldProps = TextInputProps & { label: string; error?: string; ref?: Ref<TextInputInstance> };

/** Borderless 52pt input row for use inside a Group; `label` is the placeholder and the accessibility label. Show `error` text under the group. */
export function TextField({ label, error, secureTextEntry, style, ...rest }: TextFieldProps) {
  const { colors, space, size } = useTheme();
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: size.row, paddingStart: space[5], paddingEnd: secureTextEntry ? space[2] : space[5] }}>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholder={label}
        placeholderTextColor={colors.labelSecondary}
        selectionColor={colors.tint}
        secureTextEntry={secureTextEntry && hidden}
        style={[text("body"), { flex: 1, color: colors.label, paddingVertical: space[4], textAlign: I18nManager.isRTL ? "right" : "left" }, style]}
        {...rest}
      />
      {secureTextEntry && (
        <IconButton
          icon={hidden ? Eye : EyeOff}
          color="labelSecondary"
          accessibilityLabel={t(hidden ? "auth.showPassword" : "auth.hidePassword")}
          analyticsName={hidden ? Taps.authShowPassword : Taps.authHidePassword}
          onPress={() => setHidden((h) => !h)}
        />
      )}
    </View>
  );
}
