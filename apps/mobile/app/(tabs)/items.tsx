import { Text, View } from "react-native";

export default function MyItems() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text accessibilityRole="header">My Items</Text>
    </View>
  );
}
