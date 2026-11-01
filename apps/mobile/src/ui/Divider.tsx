import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

export function Divider({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, alignSelf: "stretch" }, style]} />;
}
