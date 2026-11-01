import * as Haptics from "expo-haptics";
import { useIsFocused, useRouter } from "expo-router";
import { Check, RotateCcw, Share2 } from "lucide-react-native";
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
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { CategoryHeader, Divider, EmptyState, Screen, SwipeRow, Tap, Text } from "@/ui";
import { missingItems, useCategories, useCurrentListId, useItemMutations, useList, type Item } from "./api";
import { Avatars } from "./Avatars";
import { groupByCategory, recentlyBought } from "./group";

const LAYOUT = LinearTransition.duration(200);
const ENTER = FadeIn.duration(200);
const EXIT = FadeOut.duration(200);

export function ShoppingList() {
  const router = useRouter();
  const { colors, space, radius } = useTheme();
  const listId = useCurrentListId();
  const { data, refetch } = useList(listId, { poll: useIsFocused() });
  const categories = useCategories(listId).data ?? [];
  const { update } = useItemMutations(listId);
  const [refreshing, setRefreshing] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);

  const groups = groupByCategory(missingItems(data), categories);
  const recent = recentlyBought(data?.items ?? []);
  const bought = (id: string) => update.mutate({ id, missing: false });
  // Own flag, not isRefetching: the 5s poll would flash the spinner.
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (!data) {
    return (
      <Screen edges={["top"]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.textSecondary} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      <Animated.ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5], paddingBottom: space[9] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingTop: space[5], paddingBottom: space[2] }}>
          <Text variant="largeTitle" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
            {data.list.name}
          </Text>
          <Tap
            accessibilityLabel={t("share.title")}
            onPress={() => router.push("/share")}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 }}
          >
            <Avatars names={data.members.map((m) => m.name)} />
            <Share2 size={22} color={colors.primary} />
          </Tap>
        </View>

        <LayoutAnimationConfig skipEntering>
          {groups.length === 0 ? (
            <Animated.View entering={ENTER} style={{ flex: 1 }}>
              <EmptyState
                title={t(data.items.length ? "list.done.title" : "list.empty.title")}
                body={t(data.items.length ? "list.done.body" : "list.empty.body")}
                action={{ title: t("list.toItems"), onPress: () => router.navigate("/items") }}
              />
            </Animated.View>
          ) : (
            groups.map((g) => (
              <Animated.View key={g.category} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                <CategoryHeader title={g.category} count={g.count} />
                <View style={{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface }}>
                  {g.items.map((item, i) => (
                    <Animated.View key={item.id} layout={LAYOUT} entering={ENTER} exiting={EXIT}>
                      {i > 0 && <Divider style={{ marginStart: 56 }} />}
                      <ShoppingRow item={item} onBought={bought} />
                    </Animated.View>
                  ))}
                </View>
              </Animated.View>
            ))
          )}

          {recent.length > 0 && (
            <Animated.View layout={LAYOUT}>
              <CategoryHeader title={t("list.recent")} count={recent.length} open={recentOpen} onToggle={() => setRecentOpen((o) => !o)} />
              {recentOpen && (
                <Animated.View entering={ENTER} exiting={EXIT} style={{ borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface }}>
                  {recent.map((item, i) => (
                    <View key={item.id}>
                      {i > 0 && <Divider style={{ marginStart: space[5] }} />}
                      <Tap
                        accessibilityLabel={`${t("list.putBack")}: ${item.name}`}
                        scaleTo={0.98}
                        onPress={() => {
                          Haptics.selectionAsync();
                          update.mutate({ id: item.id, missing: true });
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: 52, paddingHorizontal: space[5] }}
                      >
                        <Text variant="body" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                          {item.name}
                        </Text>
                        <RotateCcw size={18} color={colors.primary} />
                      </Tap>
                    </View>
                  ))}
                </Animated.View>
              )}
            </Animated.View>
          )}
        </LayoutAnimationConfig>
      </Animated.ScrollView>
    </Screen>
  );
}

function ShoppingRow({ item, onBought }: { item: Item; onBought: (id: string) => void }) {
  const { colors, space, motion } = useTheme();
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
    <SwipeRow to="start" color="swipeCheckBg" icon={Check} actionLabel={t("list.check")} onCommit={check}>
      <Animated.View style={[{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingEnd: space[5] }, pulse]}>
        <Tap
          accessibilityRole="checkbox"
          accessibilityLabel={item.name}
          accessibilityState={{ checked: done }}
          onPress={check}
          scaleTo={0.9}
          style={{ width: 56, minHeight: 56, alignItems: "center", justifyContent: "center" }}
        >
          <Animated.View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              borderWidth: 2,
              alignItems: "center",
              justifyContent: "center",
              borderColor: done ? colors.primary : colors.borderControl,
              backgroundColor: done ? colors.primary : "transparent",
              transitionProperty: ["backgroundColor", "borderColor"],
              transitionDuration: motion.duration.fast,
            }}
          >
            {done && <Check size={16} color={colors.onPrimary} strokeWidth={3} />}
          </Animated.View>
        </Tap>
        <Text
          variant="body"
          color={done ? "textChecked" : "text"}
          numberOfLines={2}
          style={{ flex: 1, paddingVertical: space[3], textDecorationLine: done ? "line-through" : "none" }}
        >
          {item.name}
        </Text>
      </Animated.View>
    </SwipeRow>
  );
}
