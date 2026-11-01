import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

export type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView (forms, long content). */
  scroll?: boolean;
  /** Lift content above the keyboard. */
  keyboard?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
};

export function Screen({ children, scroll, keyboard, edges = ["top", "bottom"], style }: ScreenProps) {
  const { colors, space } = useTheme();
  const pad: ViewStyle = { flexGrow: 1, paddingHorizontal: space[5], ...style };
  const body = scroll ? (
    <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      {children}
    </ScrollView>
  ) : (
    <View style={pad}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
