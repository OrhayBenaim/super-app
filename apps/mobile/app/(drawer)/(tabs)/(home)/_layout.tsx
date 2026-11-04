import { Stack } from "expo-router";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";

/** Home pushes a Product type's cards and a group's product page inside its tab, so the tab bar stays. */
export default function HomeLayout() {
  const { colors } = useTheme();
  const pushed = { headerShown: true, title: "", headerTintColor: colors.tint, headerShadowVisible: false, headerStyle: { backgroundColor: colors.groupedBg } };
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="type/[id]" options={{ ...pushed, headerBackTitle: t("tabs.home") }} />
      {/* The page sets its back title (its Product type's name). */}
      <Stack.Screen name="group/[ref]" options={pushed} />
    </Stack>
  );
}
