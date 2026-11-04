import { router, usePathname } from "expo-router";
import { ChartColumn, History, ListChecks, Settings, Share, ShoppingBasket, type LucideIcon } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import { currentEntry, DRAWER_SECTIONS, type DrawerEntry, type DrawerEntryKey } from "./entries";

const ICONS: Record<DrawerEntryKey, LucideIcon> = { list: ListChecks, compare: ChartColumn, share: Share, recent: History, items: ShoppingBasket, settings: Settings };
// Sheets and pushed pages stack over the current page; tabs and drawer screens switch to it.
const PUSHED: DrawerEntryKey[] = ["share", "recent"];

/** Header (name, email), then Shopping, Lists and Account. The current page has a Tint label and icon. */
export function DrawerContent({ navigation }: { navigation: { closeDrawer(): void } }) {
  const { colors, space, radius, size } = useTheme();
  const insets = useSafeAreaInsets();
  const user = authClient.useSession().data?.user;
  const current = currentEntry(usePathname());

  const open = (entry: DrawerEntry) => {
    navigation.closeDrawer();
    if (PUSHED.includes(entry.key)) router.push(entry.href);
    else router.navigate(entry.href);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: insets.top + space[3], paddingBottom: space[5] }}>
      <View
        accessible
        accessibilityLabel={[user?.name, user?.email].filter(Boolean).join(", ")}
        style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[4], paddingBottom: space[5], borderBottomWidth: 1, borderBottomColor: colors.separator }}
      >
        <View style={{ width: size.target, height: size.target, borderRadius: radius.full, backgroundColor: colors.tintSoft, alignItems: "center", justifyContent: "center" }}>
          <Text variant="title3" color="tint">
            {user?.name?.trim().charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headline" numberOfLines={1}>
            {user?.name}
          </Text>
          <Text variant="footnote" color="labelSecondary" numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>
      {DRAWER_SECTIONS.map((section) => (
        <View key={section.key}>
          <Text variant="footnote" color="labelSecondary" accessibilityRole="header" style={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[2] }}>
            {t(section.title)}
          </Text>
          {section.entries.map((entry) => {
            const Icon = ICONS[entry.key];
            const selected = current === entry.key;
            return (
              <Tap
                key={entry.key}
                accessibilityLabel={t(entry.label)}
                accessibilityState={{ selected }}
                analyticsName={entry.tap}
                onPress={() => open(entry)}
                style={{ flexDirection: "row", alignItems: "center", gap: space[4], height: 48, paddingHorizontal: space[4], borderRadius: radius.control }}
              >
                <Icon size={22} color={selected ? colors.tint : colors.label} strokeWidth={1.75} />
                <Text variant={selected ? "headline" : "body"} color={selected ? "tint" : "label"} numberOfLines={1} style={{ flex: 1 }}>
                  {t(entry.label)}
                </Text>
              </Tap>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}
