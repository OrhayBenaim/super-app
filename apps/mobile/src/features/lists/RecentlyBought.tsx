import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { RotateCcw } from "lucide-react-native";
import { ScrollView } from "react-native";
import { fmt } from "@/features/compare/format";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { EmptyState, Group, IconButton, LargeTitle, Row, Screen } from "@/ui";
import { useCurrentListId, useItemMutations, useList } from "./api";
import { RECENT_MS, recentlyBought } from "./group";

/** Pushed from the List: items bought in the last 24 hours; ↺ puts one back on the list. */
export function RecentlyBought() {
  const { space } = useTheme();
  const listId = useCurrentListId();
  const { data } = useList(listId);
  const { update } = useItemMutations(listId);
  const recent = recentlyBought(data?.items ?? [], 50, Date.now() - RECENT_MS);

  return (
    <Screen edges={[]} style={{ paddingHorizontal: 0 }}>
      <Stack.Screen options={{ headerBackTitle: data?.list.name }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: space[9] }}>
        <LargeTitle title={t("list.recent")} subtitle={fmt(t("list.recent.summary"), { n: recent.length })} />
        {recent.length === 0 ? (
          <EmptyState title={t("list.recent.empty")} />
        ) : (
          <Group footer={t("list.recent.footer")} style={{ marginTop: space[3] }}>
            {recent.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                trailing={
                  <IconButton
                    icon={RotateCcw}
                    accessibilityLabel={`${t("list.putBack")}: ${item.name}`}
                    analyticsName={Taps.listPutBack}
                    onPress={() => {
                      Haptics.selectionAsync();
                      update.mutate({ id: item.id, missing: true });
                    }}
                  />
                }
              />
            ))}
          </Group>
        )}
      </ScrollView>
    </Screen>
  );
}
