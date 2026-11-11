import { Drawer } from "expo-router/drawer";
import { DrawerContent } from "@/features/drawer/DrawerContent";
import { useCurrentListId, useList } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";

/** Tabs, My items and Settings live in the drawer. No swipe: only the menu icon opens it, so swiping a List row can't. */
export default function DrawerLayout() {
  const { colors, radius } = useTheme();
  // Load the List while Home shows, so My list and My items open with it instead of a spinner.
  useList(useCurrentListId(), { poll: false });
  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        swipeEnabled: false,
        overlayColor: colors.scrim,
        overlayAccessibilityLabel: t("drawer.close"),
        // The drawer opens from the start side by itself (right in RTL); the rounded edge is its inner one.
        drawerStyle: { width: 300, backgroundColor: colors.surface, borderTopEndRadius: radius.sheet, borderBottomEndRadius: radius.sheet },
      }}
    >
      <Drawer.Screen name="(tabs)" options={{ title: t("tabs.home") }} />
      <Drawer.Screen name="items" options={{ title: t("tabs.items") }} />
      <Drawer.Screen name="settings" options={{ title: t("tabs.settings") }} />
    </Drawer>
  );
}
