import { BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { I18nManager, View, type TextInputInstance, type TextInputProps } from "react-native";
import { Easing, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { springs, text, useTheme } from "@/theme";
import { Tap } from "./Tap";
import { Text } from "./Text";

export type SheetProps = { open: boolean; onClose: () => void; children: ReactNode };

const Backdrop = (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />;

/** Content-sized modal bottom sheet (gorhom, needs BottomSheetModalProvider in app/_layout) driven by `open`; covers the tab bar. */
export function Sheet({ open, onClose, children }: SheetProps) {
  const { colors, space, radius, motion, shadow } = useTheme();
  const reduced = useReducedMotion();
  const [x1, y1, x2, y2] = motion.easing.sheet;
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);
  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      animationConfigs={reduced ? { duration: motion.duration.base, easing: Easing.bezier(x1, y1, x2, y2) } : springs.sheet}
      onDismiss={onClose}
      backdropComponent={Backdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      // Grouped background so the white inset groups inside read as groups, as on screens.
      backgroundStyle={{ backgroundColor: colors.groupedBg, borderRadius: radius.sheet }}
      style={shadow.sheet}
      handleIndicatorStyle={{ backgroundColor: colors.controlOutline }}
    >
      <BottomSheetView style={{ paddingHorizontal: space[5], paddingBottom: insets.bottom + space[5], gap: space[4] }}>{children}</BottomSheetView>
    </BottomSheetModal>
  );
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

/** Form row inside a Sheet group: label at the leading end, the input fills the rest. Follows the keyboard. */
export function SheetTextField({ label, style, ref, ...rest }: SheetTextFieldProps) {
  const { colors, space, size } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row, paddingHorizontal: space[5] }}>
      <Text>{label}</Text>
      <BottomSheetTextInput
        // gorhom types the ref as the TextInput class; RN 0.88 refs are TextInputInstance at runtime.
        ref={ref as never}
        accessibilityLabel={label}
        placeholderTextColor={colors.labelSecondary}
        selectionColor={colors.tint}
        style={[text("body"), { flex: 1, color: colors.label, paddingVertical: space[4], textAlign: I18nManager.isRTL ? "right" : "left" }, style]}
        {...rest}
      />
    </View>
  );
}
