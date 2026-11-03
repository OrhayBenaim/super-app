import * as Haptics from "expo-haptics";
import { useIsFocused, useRouter } from "expo-router";
import { Check, Plus, Share, ShoppingBasket } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { useBestStore } from "@/features/compare/useBestStore";
import { fmt, shekels } from "@/features/compare/format";
import { AddField } from "@/features/items/AddField";
import { QuantityPill } from "@/features/items/QuantityPill";
import { showPill } from "@/features/items/labels";
import { useDeleteWithUndo } from "@/features/items/useDeleteWithUndo";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { EmptyState, Group, IconButton, LargeTitle, Row, Screen, Tap, Text } from "@/ui";
import { missingItems, useCategories, useCurrentListId, useItemMutations, useList, type Item } from "./api";
import { Avatars } from "./Avatars";
import { groupByCategory, RECENT_MS, recentlyBought } from "./group";

const LAYOUT = LinearTransition.duration(200);
const ENTER = FadeIn.duration(200);
const EXIT = FadeOut.duration(200);
// Check row: 16 gutter + 24 circle + 12 gap, so hairlines start at the text.
const CHECK_INSET = 52;

export function ShoppingList() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const listId = useCurrentListId();
  const { data, refetch } = useList(listId, { poll: useIsFocused() });
  const categories = useCategories(listId).data ?? [];
  const { update } = useItemMutations(listId);
  const { deleteItem, toast } = useDeleteWithUndo(listId);
  const cheapest = useBestStore(data);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const missing = missingItems(data);
  const groups = groupByCategory(missing, categories);
  const recent = recentlyBought(data?.items ?? [], 50, Date.now() - RECENT_MS);
  const bought = (id: string) => update.mutate({ id, missing: false }, { onSuccess: () => track(Events.listItemChecked) });
  // Own flag, not isRefetching: the 5s poll would flash the spinner.
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (!data) {
    return (
      <Screen edges={["top"]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.labelSecondary} />
      </Screen>
    );
  }

  const nav = (
    <>
      <Tap accessibilityLabel={t("share.title")} analyticsName={Taps.shareTitle} onPress={() => router.push("/share")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 }}>
        <Avatars names={data.members.map((m) => m.name)} size={24} />
        <Share size={22} color={colors.tint} strokeWidth={1.75} />
      </Tap>
      <IconButton icon={Plus} accessibilityLabel={t("items.add")} analyticsName={Taps.itemsAdd} onPress={() => setAdding(true)} />
    </>
  );

  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      <Animated.ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5], paddingBottom: space[9] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.labelSecondary} />}
      >
        <LargeTitle
          title={data.list.name}
          menu={{ hint: t("lists.title"), analyticsName: Taps.listSwitch, onPress: () => router.push("/lists") }}
          subtitle={missing.length ? fmt(t("list.summary"), { n: missing.length }) : undefined}
          nav={nav}
        />

        <LayoutAnimationConfig skipEntering>
          {groups.length === 0 ? (
            <Animated.View entering={ENTER} style={{ flex: 1 }}>
              <EmptyState
                icon={ShoppingBasket}
                title={t("list.empty.title")}
                body={t("list.empty.body")}
                action={{ title: t("list.toItems"), analyticsName: Taps.listToItems, onPress: () => router.navigate("/items") }}
              />
            </Animated.View>
          ) : (
            <>
              {cheapest && (
                <Group style={{ marginTop: space[3] }}>
                  <Row
                    title={t("list.cheapest")}
                    value={`${cheapest.chainName} · ${shekels(cheapest.total)}`}
                    valueColor="tint"
                    accessibilityRole="link"
                    analyticsName={Taps.listCheapest}
                    onPress={() => router.navigate("/compare")}
                  />
                </Group>
              )}
              {groups.map((g) => (
                <Animated.View key={g.category} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                  <Group title={g.category} count={g.count} inset={CHECK_INSET + space[5]}>
                    {g.items.map((item) => (
                      <Animated.View key={item.id} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                        <CheckRow item={item} onBought={bought} onEdit={() => {
                          track(Events.itemEditOpened, { from: "list" });
                          router.push({ pathname: "/item/[id]", params: { id: item.id } });
                        }} />
                      </Animated.View>
                    ))}
                  </Group>
                </Animated.View>
              ))}
            </>
          )}

          {recent.length > 0 && (
            <Animated.View layout={LAYOUT} style={{ marginTop: space[6] }}>
              <Group>
                <Row title={t("list.recent")} analyticsName={Taps.listRecent} value={String(recent.length)} chevron onPress={() => router.push("/recent")} />
              </Group>
            </Animated.View>
          )}
        </LayoutAnimationConfig>
      </Animated.ScrollView>

      {adding && <AddField from="list" listId={listId} items={data.items} onClose={() => setAdding(false)} />}
      {toast}
    </Screen>
  );
}

/** Leading check circle (the only way to tick), name; long-press edits. Checked: strike-through, then the row leaves. */
function CheckRow({ item, onBought, onEdit }: { item: Item; onBought: (id: string) => void; onEdit: () => void }) {
  const { colors, space, size, motion } = useTheme();
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);
  const scale = useSharedValue(1);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const check = () => {
    if (done) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDone(true);
    if (!reduced) scale.set(withSequence(withSpring(motion.scale.rowCheck, springs.snappy), withSpring(1, springs.snappy)));
    // Let the strike-through read before the row leaves; the mutation removes it optimistically.
    setTimeout(() => onBought(item.id), motion.duration.reflowDelay);
  };

  return (
    // Checkbox and label are siblings, not nested, so VoiceOver can reach both.
    <Animated.View style={[{ flexDirection: "row", alignItems: "center", minHeight: size.row }, pulse]}>
      <Tap
        accessibilityRole="checkbox"
        accessibilityLabel={`${t("list.check")}: ${item.name}`}
        analyticsName={Taps.listCheck}
        accessibilityState={{ checked: done }}
        onPress={check}
        scaleTo={0.9}
        // 44pt+ target around the 24pt circle; the row's text starts at CHECK_INSET + gutter.
        style={{ width: CHECK_INSET + space[3], minHeight: size.row, paddingStart: space[5], justifyContent: "center" }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: done ? 0 : 1.5,
            alignItems: "center",
            justifyContent: "center",
            borderColor: colors.controlOutline,
            backgroundColor: done ? colors.tint : "transparent",
          }}
        >
          {done && <Check size={15} color={colors.tintOn} strokeWidth={3} />}
        </View>
      </Tap>
      <Tap
        accessibilityLabel={item.name}
        accessibilityHint={t("items.editHint")}
        analyticsName={Taps.listItem}
        scaleTo={1}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onEdit();
        }}
        style={{ flex: 1, alignSelf: "stretch", justifyContent: "center", paddingEnd: space[5] }}
      >
        <Text color={done ? "labelSecondary" : "label"} numberOfLines={2} style={{ paddingVertical: space[4], textDecorationLine: done ? "line-through" : "none" }}>
          {item.name}
        </Text>
      </Tap>
      {showPill(item.quantity, item.soldBy, "list") && (
        <View style={{ paddingEnd: space[5] }}>
          <QuantityPill item={item} screen="list" />
        </View>
      )}
    </Animated.View>
  );
}
