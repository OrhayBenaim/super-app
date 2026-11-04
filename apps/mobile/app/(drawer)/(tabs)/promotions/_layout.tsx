import { Stack } from "expo-router";
import { pushedHeader } from "@/features/tabs/pushedHeader";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";

/** Promotions pushes a card's product page inside its tab, so the tab bar stays. */
export default function PromotionsLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="group/[ref]" options={{ ...pushedHeader(colors), headerBackTitle: t("tabs.promotions") }} />
    </Stack>
  );
}
