import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { I18nManager, View, type TextInputInstance, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { springs, text, useTheme } from "@/theme";
import { Text } from "./Text";

export type SheetProps = { open: boolean; onClose: () => void; children: ReactNode };

const Backdrop = (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />;

/** Content-sized bottom sheet (gorhom) driven by `open`; springs.sheet; drag or backdrop tap closes. */
export function Sheet({ open, onClose, children }: SheetProps) {
  const { colors, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheet>(null);
  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      enableDynamicSizing
      enablePanDownToClose
      animationConfigs={springs.sheet}
      onClose={onClose}
      backdropComponent={Backdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: colors.surfaceRaised, borderRadius: radius.xl }}
      handleIndicatorStyle={{ backgroundColor: colors.borderControl }}
    >
      <BottomSheetView style={{ paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: insets.bottom + space[5], gap: space[5] }}>
        {children}
      </BottomSheetView>
    </BottomSheet>
  );
}

export type SheetTextFieldProps = TextInputProps & { label: string; ref?: Ref<TextInputInstance> };

/** TextField look-alike built on BottomSheetTextInput so the sheet follows the keyboard. */
export function SheetTextField({ label, onFocus, onBlur, style, ref, ...rest }: SheetTextFieldProps) {
  const { colors, radius, space } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[3] }}>
      <Text variant="subhead" color="textSecondary">
        {label}
      </Text>
      <BottomSheetTextInput
        // gorhom types the ref as the TextInput class; RN 0.88 refs are TextInputInstance at runtime.
        ref={ref as never}
        accessibilityLabel={label}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.primary}
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
          {
            minHeight: 52,
            borderWidth: 1.5,
            borderRadius: radius.md,
            borderColor: focused ? colors.primary : colors.borderControl,
            backgroundColor: colors.surface,
            color: colors.text,
            paddingHorizontal: space[5],
            paddingVertical: space[4],
            textAlign: I18nManager.isRTL ? "right" : "left",
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
