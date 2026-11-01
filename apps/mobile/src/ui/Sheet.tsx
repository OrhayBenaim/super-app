import type { ReactNode, Ref } from "react";
import { I18nManager, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { text, useTheme } from "@/theme";
import { Tap } from "./Tap";
import { Text } from "./Text";

/** Body of a sheet route (a Stack screen with `presentation: "formSheet"`, see app/_layout): gutters and the bottom inset. */
export function Sheet({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={{ paddingTop: space[3], paddingHorizontal: space[5], paddingBottom: insets.bottom + space[5], gap: space[4] }}>{children}</View>;
}

type NavAction = { title: string; onPress: () => void; disabled?: boolean };

/** Sheet nav bar: leading action (Cancel / Back), centered title, trailing action (Save / Done). */
export function SheetHeader({ title, start, end }: { title: string; start?: NavAction; end?: NavAction }) {
  const { space, size } = useTheme();
  const action = (a: NavAction | undefined, strong: boolean) =>
    a ? (
      <Tap accessibilityLabel={a.title} onPress={a.onPress} disabled={a.disabled} hitSlop={8} style={{ minHeight: size.target, justifyContent: "center", opacity: a.disabled ? 0.4 : 1 }}>
        <Text variant={strong ? "headline" : "body"} color="tint">
          {a.title}
        </Text>
      </Tap>
    ) : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: size.target, gap: space[3] }}>
      <View style={{ flex: 1, alignItems: "flex-start" }}>{action(start, false)}</View>
      <Text variant="headline" accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, textAlign: "center" }}>
        {title}
      </Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>{action(end, true)}</View>
    </View>
  );
}

export type SheetTextFieldProps = TextInputProps & { label: string; ref?: Ref<TextInputInstance> };

/** Form row inside a Sheet group: label at the leading end, the input fills the rest. */
export function SheetTextField({ label, style, ref, ...rest }: SheetTextFieldProps) {
  const { colors, space, size } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row, paddingHorizontal: space[5] }}>
      <Text>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.labelSecondary}
        selectionColor={colors.tint}
        style={[text("body"), { flex: 1, color: colors.label, paddingVertical: space[4], textAlign: I18nManager.isRTL ? "right" : "left" }, style]}
        {...rest}
      />
    </View>
  );
}
