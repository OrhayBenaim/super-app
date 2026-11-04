import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "@/features/tabs/TabBar";
import { t } from "@/lib/strings";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: t("tabs.list") }} />
      <Tabs.Screen name="compare" options={{ title: t("tabs.compare") }} />
    </Tabs>
  );
}
