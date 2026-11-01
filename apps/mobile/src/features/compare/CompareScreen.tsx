import { router } from "expo-router";
import { ChevronRight, MapPin, SearchX, TriangleAlert, ShoppingBasket, type LucideIcon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { I18nManager, RefreshControl, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { missingCodes, missingItems, useCurrentListId, useList } from "@/features/lists/api";
import { syncGeofences, useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { useLocation } from "@/lib/location";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { Button, Screen, Tap, Text } from "@/ui";
import { RADII, useCompare } from "./api";
import { fmt } from "./format";
import { RadiusChips } from "./RadiusChips";
import { StoreCardSkeleton } from "./Skeleton";
import { sortStores, type Sort, type StoreResult } from "./sort";
import { SortControl } from "./SortControl";
import { StoreCard } from "./StoreCard";

// Cards glide to their new slot when the sort changes; snappy matches the segmented pill.
const reorder = LinearTransition.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness).mass(springs.snappy.mass);

export function CompareScreen() {
  const { space, colors } = useTheme();
  const [sort, setSort] = useState<Sort>("price");
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [pulling, setPulling] = useState(false);

  const listId = useCurrentListId();
  const list = useList(listId, { poll: false });
  const items = missingItems(list.data);
  const codes = missingCodes(list.data);
  const location = useLocation();
  const compare = useCompare(location.coords, radiusKm, codes);
  const { enabled: alertsOn } = useNearbyAlerts();

  const names = useMemo(() => new Map(items.flatMap((i) => (i.productCode ? [[i.productCode, i.name] as const] : []))), [items]);
  const listText = items.map((i) => i.name).join("\n");
  const stores = useMemo(() => sortStores(compare.data?.stores ?? [], sort), [compare.data, sort]);
  const bestId = useMemo(() => sortStores(compare.data?.stores ?? [], "price")[0]?.storeId, [compare.data]);

  // Deps are only the fetch stamp and the flag: re-sync per fetch, not per render.
  // Fresh results: re-arm nearby alerts on the same basket. Best-effort; a failure just keeps the old geofences.
  useEffect(() => {
    if (alertsOn && location.coords && compare.dataUpdatedAt) syncGeofences(location.coords, codes).catch(() => {});
  }, [compare.dataUpdatedAt, alertsOn]);

  const header = (
    <View style={{ gap: space[5], paddingBottom: space[5] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="subhead" color="textSecondary" tabular>
          {fmt(t("compare.summary"), { items: items.length, matched: codes.length })}
        </Text>
        {items.length > codes.length && (
          <Tap
            accessibilityLabel={fmt(t("compare.unmatchedHint"), { n: items.length - codes.length })}
            accessibilityRole="link"
            onPress={() => router.navigate("/(tabs)/items")}
            style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}
          >
            <Text variant="footnote" color="primary" style={{ flexShrink: 1 }}>
              {fmt(t("compare.unmatchedHint"), { n: items.length - codes.length })}
            </Text>
            <ChevronRight size={16} color={colors.primary} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />
          </Tap>
        )}
      </View>
      <SortControl value={sort} onChange={setSort} />
      <RadiusChips value={radiusKm} onChange={setRadiusKm} />
    </View>
  );

  const body = (() => {
    if (list.isPending || location.status === "checking" || location.status === "locating") return <Skeletons />;
    if (list.isError) return <State icon={TriangleAlert} title={t("compare.error.title")} action={{ title: t("compare.retry"), onPress: () => list.refetch() }} />;
    if (!codes.length) return <State icon={ShoppingBasket} title={t("compare.noBasket.title")} body={t("compare.noBasket.body")} />;
    if (location.status === "denied")
      return (
        <State
          icon={MapPin}
          title={t("compare.location.title")}
          body={t("compare.location.body")}
          action={{ title: t(location.canAskAgain ? "compare.location.allow" : "compare.location.settings"), onPress: location.request }}
        />
      );
    if (location.status === "error")
      return <State icon={TriangleAlert} title={t("compare.location.error")} action={{ title: t("compare.retry"), onPress: location.refresh }} />;
    // A disabled query is also "pending" in TanStack v5, so this only runs once location and codes exist.
    if (compare.isPending) return <Skeletons />;
    if (compare.isError)
      return <State icon={TriangleAlert} title={t("compare.error.title")} action={{ title: t("compare.retry"), onPress: () => compare.refetch() }} />;
    if (!stores.length) {
      const wider = RADII.find((r) => r > radiusKm);
      return (
        <State
          icon={SearchX}
          title={fmt(t("compare.empty.title"), { km: radiusKm })}
          body={t("compare.empty.body")}
          action={wider ? { title: fmt(t("compare.empty.widen"), { km: wider }), onPress: () => setRadiusKm(wider) } : undefined}
        />
      );
    }
    return null;
  })();

  return (
    <Screen edges={[]} style={{ paddingHorizontal: 0 }}>
      <Animated.FlatList
        data={body ? [] : stores}
        keyExtractor={(s: StoreResult) => s.storeId}
        itemLayoutAnimation={reorder}
        ListHeaderComponent={header}
        ListEmptyComponent={body ?? undefined}
        ItemSeparatorComponent={() => <View style={{ height: space[4] }} />}
        renderItem={({ item }: { item: StoreResult }) => (
          <StoreCard store={item} basketSize={codes.length} best={item.storeId === bestId} names={names} listText={listText} />
        )}
        contentContainerStyle={{ padding: space[5], paddingBottom: space[9] }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={colors.textSecondary}
            onRefresh={async () => {
              setPulling(true);
              await Promise.all([list.refetch(), compare.refetch()]).finally(() => setPulling(false));
            }}
          />
        }
      />
    </Screen>
  );
}

function Skeletons() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[4] }}>
      <StoreCardSkeleton />
      <StoreCardSkeleton />
      <StoreCardSkeleton />
    </View>
  );
}

function State({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: { title: string; onPress: () => unknown } }) {
  const { space, colors } = useTheme();
  return (
    <Animated.View entering={FadeIn} style={{ alignItems: "center", gap: space[4], paddingVertical: space[10], paddingHorizontal: space[5] }}>
      <Icon size={36} color={colors.textTertiary} />
      <Text variant="title3" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body && (
        <Text variant="body" color="textSecondary" style={{ textAlign: "center" }}>
          {body}
        </Text>
      )}
      {action && <Button variant="secondary" title={action.title} onPress={action.onPress} style={{ alignSelf: "stretch", marginTop: space[3] }} />}
    </Animated.View>
  );
}
