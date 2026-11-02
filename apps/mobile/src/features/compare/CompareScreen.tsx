import { useIsFocused, useRouter } from "expo-router";
import { MapPin, SearchX, ShoppingBasket, TriangleAlert } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useDeleteWithUndo } from "@/features/items/useDeleteWithUndo";
import { missingCodes, missingItems, useCurrentListId, useList } from "@/features/lists/api";
import { syncGeofences, useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { Events, Taps, track } from "@/lib/analytics";
import { useLocation } from "@/lib/location";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { EmptyState, Group, LargeTitle, Screen, ShoppingLoader } from "@/ui";
import { RADII, useCompare, useRadius } from "./api";
import { BestStore, StoreRow } from "./BestStore";
import { fmt } from "./format";
import type { MissingStore } from "./MissingSheet";
import { RadiusMenu } from "./RadiusMenu";
import { saving, sortStores, type Sort } from "./sort";
import { SortControl } from "./SortControl";

// Rows glide to their new slot when the sort changes; snappy matches the segmented thumb.
const reorder = LinearTransition.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness).mass(springs.snappy.mass);

export function CompareScreen() {
  const router = useRouter();
  const { space, colors } = useTheme();
  const [sort, setSort] = useState<Sort>("price");
  const { km: radiusKm, set: setRadiusKm } = useRadius();
  const [pulling, setPulling] = useState(false);

  const listId = useCurrentListId();
  const list = useList(listId, { poll: false });
  const items = missingItems(list.data);
  const codes = missingCodes(list.data);
  const location = useLocation();
  const compare = useCompare(location.coords, radiusKm, codes);
  const { enabled: alertsOn } = useNearbyAlerts();
  // Owns the Undo toast for a delete made in the item sheet opened from the missing sheet.
  const { toast } = useDeleteWithUndo(listId);

  const byPrice = useMemo(() => sortStores(compare.data?.stores ?? [], "price"), [compare.data]);
  const best = byPrice[0];
  const others = useMemo(() => sortStores(byPrice.slice(1), sort), [byPrice, sort]);
  const listText = items.map((i) => i.name).join("\n");

  // Deps are only the fetch stamp and the flag: re-sync per fetch, not per render.
  // Fresh results: re-arm nearby alerts on the same basket. Best-effort; a failure just keeps the old geofences.
  useEffect(() => {
    if (alertsOn && location.coords && compare.dataUpdatedAt) syncGeofences(location.coords, codes).catch(() => {});
  }, [compare.dataUpdatedAt, alertsOn]);

  // Once per visit with results (tabs stay mounted, so focus marks a visit); the $screen event counts every visit.
  const focused = useIsFocused();
  useEffect(() => {
    if (focused && best) track(Events.compareViewed, { stores: byPrice.length, radiusKm, items: items.length, matched: codes.length });
  }, [focused, !!best]);

  const loading = list.isPending || location.status === "checking" || location.status === "locating" || (location.status === "ready" && codes.length > 0 && compare.isPending);
  const body = (() => {
    if (loading) return <ShoppingLoader label={t("compare.loading")} />;
    if (list.isError) return <EmptyState icon={TriangleAlert} title={t("compare.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.compareRetryList, onPress: () => list.refetch() }} />;
    if (!codes.length) return <EmptyState icon={ShoppingBasket} title={t("compare.noBasket.title")} body={t("compare.noBasket.body")} />;
    if (location.status === "denied")
      return (
        <EmptyState
          icon={MapPin}
          title={t("compare.location.title")}
          body={t("compare.location.body")}
          action={{ title: t(location.canAskAgain ? "compare.location.allow" : "compare.location.settings"), analyticsName: location.canAskAgain ? Taps.compareLocationAllow : Taps.compareLocationSettings, onPress: location.request, filled: true }}
        />
      );
    if (location.status === "error") return <EmptyState icon={TriangleAlert} title={t("compare.location.error")} action={{ title: t("compare.retry"), analyticsName: Taps.compareRetryLocation, onPress: location.refresh }} />;
    if (compare.isError) return <EmptyState icon={TriangleAlert} title={t("compare.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.compareRetryCompare, onPress: () => compare.refetch() }} />;
    if (!best) {
      const wider = RADII.find((r) => r > radiusKm);
      return (
        <EmptyState
          icon={SearchX}
          title={fmt(t("compare.empty.title"), { km: radiusKm })}
          body={t("compare.empty.body")}
          action={wider ? { title: fmt(t("compare.empty.widen"), { km: wider }), analyticsName: Taps.compareEmptyWiden, onPress: () => setRadiusKm(wider) } : undefined}
        />
      );
    }
    return null;
  })();

  const subtitle = loading ? t("compare.searching") : codes.length ? fmt(t("compare.summary"), { items: items.length, matched: codes.length }) : undefined;

  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5], paddingBottom: space[9] }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={colors.labelSecondary}
            onRefresh={async () => {
              setPulling(true);
              await Promise.all([list.refetch(), compare.refetch()]).finally(() => setPulling(false));
            }}
          />
        }
      >
        <LargeTitle title={t("tabs.compare")} subtitle={subtitle} nav={location.status !== "denied" && <RadiusMenu value={radiusKm} onChange={setRadiusKm} />} />
        {location.status !== "denied" && codes.length > 0 && <SortControl value={sort} onChange={setSort} />}
        {body ?? (
          <>
            <BestStore store={best} basketSize={items.length} saving={saving(byPrice)} listText={listText} onShowMissing={() => {
                const { chainName, total, matched, missingCodes: codesHere } = best;
                const store: MissingStore = { chainName, total, matched, missingCodes: codesHere };
                router.push({ pathname: "/missing", params: { store: JSON.stringify(store) } });
              }}
            />
            {others.length > 0 && (
              <Group title={t("compare.others")} count={others.length}>
                {others.map((s) => (
                  <Animated.View key={s.storeId} layout={reorder}>
                    <StoreRow store={s} basketSize={items.length} />
                  </Animated.View>
                ))}
              </Group>
            )}
          </>
        )}
      </ScrollView>

      {toast}
    </Screen>
  );
}
