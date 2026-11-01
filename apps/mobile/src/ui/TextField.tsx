import { Eye, EyeOff } from "lucide-react-native";
import { useState, type Ref } from "react";
import { I18nManager, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import Animated from "react-native-reanimated";
import { t } from "@/lib/strings";
import { text, useTheme } from "@/theme";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

export type TextFieldProps = TextInputProps & { label: string; error?: string; ref?: Ref<TextInputInstance> };

export function TextField({ label, error, secureTextEntry, onFocus, onBlur, style, ...rest }: TextFieldProps) {
  const { colors, radius, space, motion } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderControl;

  return (
    <View style={{ gap: space[3] }}>
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      <Animated.View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 52,
          borderWidth: 1.5,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          paddingStart: space[5],
          borderColor,
          // State change, no finger driving it: a CSS transition is enough.
          transitionProperty: "borderColor",
          transitionDuration: motion.duration.fast,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          secureTextEntry={secureTextEntry && hidden}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            text("body"),
            { flex: 1, color: colors.text, paddingVertical: space[4], textAlign: I18nManager.isRTL ? "right" : "left" },
            style,
          ]}
          {...rest}
        />
        {secureTextEntry && (
          <IconButton
            icon={hidden ? Eye : EyeOff}
            accessibilityLabel={t(hidden ? "auth.showPassword" : "auth.hidePassword")}
            onPress={() => setHidden((h) => !h)}
          />
        )}
      </Animated.View>
      {error && (
        <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}
