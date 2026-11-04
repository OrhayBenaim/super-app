import { Stack } from "expo-router";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";

/** Home pushes a Product type's cards (and, later, a group's product page) inside its tab, so the tab bar stays. */
export default function HomeLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="type/[id]"
        options={{ headerShown: true, title: "", headerBackTitle: t("tabs.home"), headerTintColor: colors.tint, headerShadowVisible: false, headerStyle: { backgroundColor: colors.groupedBg } }}
      />
    </Stack>
  );
}
