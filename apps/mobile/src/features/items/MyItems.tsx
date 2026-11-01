import * as Haptics from "expo-haptics";
import { useIsFocused } from "expo-router";
import { Barcode, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from "react-native-reanimated";
import { useCategories, useCurrentListId, useItemMutations, useList, type Item } from "@/features/lists/api";
import { groupByCategory } from "@/features/lists/group";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { CategoryHeader, Chip, Divider, EmptyState, Screen, SwipeRow, Tap, Text, TextField } from "@/ui";
import { ItemSheet } from "./ItemSheet";
import { MissingToggle } from "./MissingToggle";

const LAYOUT = LinearTransition.duration(200);
const ENTER = FadeIn.duration(200);
const EXIT = FadeOut.duration(150);

export function MyItems() {
  const { colors, space, radius, shadow } = useTheme();
  const listId = useCurrentListId();
  const { data } = useList(listId, { poll: useIsFocused() });
  const categories = useCategories(listId).data ?? [];
  const { update, remove } = useItemMutations(listId);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });

  const q = query.trim().toLocaleLowerCase();
  const items = data?.items ?? [];
  const groups = groupByCategory(q ? items.filter((i) => i.name.toLocaleLowerCase().includes(q)) : items, categories);
  const toggle = (c: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (!next.delete(c)) next.add(c);
      return next;
    });
  const confirmDelete = (item: Item) =>
    Alert.alert(t("items.delete.title").replace("{name}", item.name), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          remove.mutate(item.id);
        },
      },
    ]);
  const openAdd = () => setSheet({ open: true, item: null });

  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      {!data ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.textSecondary} />
      ) : items.length === 0 ? (
        <EmptyState title={t("items.empty.title")} body={t("items.empty.body")} action={{ title: t("items.empty.cta"), onPress: openAdd }} />
      ) : (
        <Animated.ScrollView
          contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: space[11] + space[8] }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text variant="largeTitle" accessibilityRole="header" style={{ paddingTop: space[5], paddingBottom: space[4] }}>
            {t("tabs.items")}
          </Text>
          <TextField label={t("items.search")} placeholder={t("items.search.placeholder")} value={query} onChangeText={setQuery} returnKeyType="search" clearButtonMode="while-editing" />
          {groups.length === 0 && (
            <Text variant="callout" color="textSecondary" style={{ paddingTop: space[7], textAlign: "center" }}>
              {t("items.noResults")}
            </Text>
          )}
          <LayoutAnimationConfig skipEntering>
            {groups.map((g) => {
              const open = !collapsed.has(g.category);
              return (
                <Animated.View key={g.category} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                  <CategoryHeader title={g.category} count={g.count} open={open} onToggle={() => toggle(g.category)} />
                  {open && (
                    <Animated.View entering={ENTER} exiting={EXIT} style={{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface }}>
                      {g.items.map((item, i) => (
                        <Animated.View key={item.id} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                          {i > 0 && <Divider style={{ marginStart: space[5] }} />}
                          <SwipeRow to="end" color="danger" icon={Trash2} actionLabel={t("common.delete")} onCommit={() => confirmDelete(item)}>
                            <ItemRow
                              item={item}
                              onEdit={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setSheet({ open: true, item });
                              }}
                              onToggle={(missing) => update.mutate({ id: item.id, missing })}
                            />
                          </SwipeRow>
                        </Animated.View>
                      ))}
                    </Animated.View>
                  )}
                </Animated.View>
              );
            })}
          </LayoutAnimationConfig>
        </Animated.ScrollView>
      )}

      <Tap
        accessibilityLabel={t("items.add")}
        onPress={openAdd}
        scaleTo={0.92}
        style={{
          position: "absolute",
          bottom: space[6],
          end: space[5],
          width: 56,
          height: 56,
          borderRadius: radius.full,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          ...shadow.md,
        }}
      >
        <Plus size={26} color={colors.onPrimary} strokeWidth={2.5} />
      </Tap>

      <ItemSheet open={sheet.open} item={sheet.item} listId={listId} onClose={() => setSheet((s) => ({ ...s, open: false }))} />
    </Screen>
  );
}

function ItemRow({ item, onEdit, onToggle }: { item: Item; onEdit: () => void; onToggle: (missing: boolean) => void }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingEnd: space[5] }}>
      <Tap
        accessibilityLabel={item.name}
        accessibilityHint={t("items.editHint")}
        onLongPress={onEdit}
        scaleTo={0.98}
        style={{ flex: 1, minHeight: 64, justifyContent: "center", gap: space[2], paddingVertical: space[3], paddingStart: space[5] }}
      >
        <Text variant="body" numberOfLines={2}>
          {item.name}
        </Text>
        <View style={{ flexDirection: "row", gap: space[2] }}>
          <Chip label={item.category} />
          {item.productCode && <Chip label={t("items.matched")} icon={Barcode} tone="primary" />}
        </View>
      </Tap>
      <MissingToggle value={item.missing} onChange={onToggle} label={`${item.name}, ${t("items.missing")}`} />
    </View>
  );
}
