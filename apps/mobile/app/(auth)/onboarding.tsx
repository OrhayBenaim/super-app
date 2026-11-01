import { Text, View } from "react-native";

export default function Onboarding() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text accessibilityRole="header">Welcome to Grocer</Text>
    </View>
  );
}
