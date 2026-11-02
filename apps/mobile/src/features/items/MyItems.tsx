import { useIsFocused, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert } from "react-native";
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from "react-native-reanimated";
import { useCategories, useCurrentListId, useItemMutations, useList, type Item } from "@/features/lists/api";
import { groupByCategory } from "@/features/lists/group";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { EmptyState, Group, IconButton, LargeTitle, Screen, SearchField, SwipeRow, Text } from "@/ui";
import { AddField } from "./AddField";
import { ItemRow } from "./ItemRow";
import { useDeleteWithUndo } from "./useDeleteWithUndo";

const LAYOUT = LinearTransition.duration(200);
const ENTER = FadeIn.duration(200);
const EXIT = FadeOut.duration(150);

export function MyItems() {
  const { colors, space } = useTheme();
  const listId = useCurrentListId();
  const { data } = useList(listId, { poll: useIsFocused() });
  const categories = useCategories(listId).data ?? [];
  const { update } = useItemMutations(listId);
  const { deleteItem, toast } = useDeleteWithUndo(listId);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const q = query.trim().toLocaleLowerCase();
  const items = data?.items ?? [];
  const groups = groupByCategory(q ? items.filter((i) => i.name.toLocaleLowerCase().includes(q)) : items, categories);
  const toggle = (item: Item, missing: boolean) => update.mutate({ id: item.id, missing }, { onError: () => Alert.alert(t("common.error")) });
  const nav = <IconButton icon={Plus} accessibilityLabel={t("items.add")} analyticsName={Taps.itemsAdd} onPress={() => setAdding(true)} />;

  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      {!data ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.labelSecondary} />
      ) : items.length === 0 ? (
        <Animated.View entering={ENTER} style={{ flex: 1, paddingHorizontal: space[5] }}>
          <LargeTitle title={t("tabs.items")} nav={nav} />
          <EmptyState title={t("items.empty.title")} body={t("items.empty.body")} action={{ title: t("items.empty.cta"), analyticsName: Taps.itemsEmptyCta, onPress: () => setAdding(true) }} />
        </Animated.View>
      ) : (
        <Animated.ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: space[9] }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <LargeTitle title={t("tabs.items")} nav={nav} />
          <SearchField label={t("items.search.placeholder")} value={query} onChangeText={setQuery} returnKeyType="search" />
          {groups.length === 0 && (
            <Text variant="callout" color="labelSecondary" style={{ paddingTop: space[7], textAlign: "center" }}>
              {t("items.noResults")}
            </Text>
          )}
          <LayoutAnimationConfig skipEntering>
            {groups.map((g, gi) => (
              <Animated.View key={g.category} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                <Group title={g.category} count={g.count} footer={gi === groups.length - 1 ? t("items.footer") : undefined}>
                  {g.items.map((item) => (
                    <Animated.View key={item.id} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                      <SwipeRow label={t("common.delete")} onDelete={() => deleteItem(item)}>
                        <ItemRow item={item} onToggle={(missing) => toggle(item, missing)} onEdit={() => router.push({ pathname: "/item/[id]", params: { id: item.id } })} />
                      </SwipeRow>
                    </Animated.View>
                  ))}
                </Group>
              </Animated.View>
            ))}
          </LayoutAnimationConfig>
        </Animated.ScrollView>
      )}

      {adding && <AddField from="items" listId={listId} items={items} onClose={() => setAdding(false)} />}
      {toast}
    </Screen>
  );
}
