import { useIsFocused, useRouter } from "expo-router";
import { MapPin, SearchX, ShoppingBasket, TriangleAlert } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { useDeleteWithUndo } from "@/features/items/useDeleteWithUndo";
import { basketSize, missingBasket, missingItems, useCurrentListId, useList } from "@/features/lists/api";
import { syncGeofences, useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { Events, Taps, track } from "@/lib/analytics";
import { useLocation } from "@/lib/location";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { EmptyState, Group, LargeTitle, Screen, ShoppingLoader } from "@/ui";
import { RADII, useCompare, useRadius } from "./api";
import { BestStore, StoreRow } from "./BestStore";
import { missingCount } from "./breakdown";
import { fmt } from "./format";
import { RadiusMenu } from "./RadiusMenu";
import { openSplit, saving, sortStores, type Sort } from "./sort";
import { SortControl } from "./SortControl";

// Rows glide to their new slot when the sort changes; snappy matches the segmented thumb.
const reorder = LinearTransition.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness).mass(springs.snappy.mass);

// Local prices answer in milliseconds; hold the loader until the mascot reaches the store (half of its 2.8 s trip) so it never just flashes.
const MIN_LOADER_MS = 1400;

/** True while `on`, and for the rest of `ms` after it turned on. */
function useMinDuration(on: boolean, ms: number) {
  const [held, setHeld] = useState(on);
  const since = useRef(0);
  useEffect(() => {
    if (on) {
      since.current = Date.now();
      setHeld(true);
      return;
    }
    const id = setTimeout(() => setHeld(false), Math.max(0, since.current + ms - Date.now()));
    return () => clearTimeout(id);
  }, [on, ms]);
  return on || held;
}

export function CompareScreen() {
  const router = useRouter();
  const { space, colors, motion } = useTheme();
  const [sort, setSort] = useState<Sort>("price");
  // The store shown as the big card; null = the first one in the current sort.
  const [openId, setOpenId] = useState<string | null>(null);
  const { km: radiusKm, set: setRadiusKm } = useRadius();
  const [pulling, setPulling] = useState(false);

  const listId = useCurrentListId();
  const list = useList(listId, { poll: false });
  const items = missingItems(list.data);
  const basket = missingBasket(list.data);
  const matched = basketSize(basket);
  const location = useLocation();
  // Radius and sort only mean something once location is (or will be) available.
  const showControls = location.status !== "checking" && location.status !== "denied";
  const compare = useCompare(location.coords, radiusKm, basket);
  const { enabled: alertsOn } = useNearbyAlerts();
  // Owns the Undo toast for a delete made in the item sheet opened from the breakdown sheet.
  const { toast } = useDeleteWithUndo(listId);

  const byPrice = useMemo(() => sortStores(compare.data?.stores ?? [], "price"), [compare.data]);
  const sorted = useMemo(() => sortStores(byPrice, sort), [byPrice, sort]);
  // Accordion: the open store sits in its sorted slot as the card, the rest stay rows around it.
  const { open, above, below } = openSplit(sorted, openId);
  // With rows above the card, the rows below are no longer "the others", so they lose the header.
  const headed = above.length === 0;
  const listText = items.map((i) => i.name).join("\n");

  // Deps are only the fetch stamp and the flag: re-sync per fetch, not per render.
  // Fresh results: re-arm nearby alerts on the same basket. Best-effort; a failure just keeps the old geofences.
  useEffect(() => {
    if (alertsOn && location.coords && compare.dataUpdatedAt) syncGeofences(location.coords, basket).catch(() => {});
  }, [compare.dataUpdatedAt, alertsOn]);

  // Once per visit with results (tabs stay mounted, so focus marks a visit); the $screen event counts every visit.
  const focused = useIsFocused();
  useEffect(() => {
    if (focused && open) track(Events.compareViewed, { stores: byPrice.length, radiusKm, items: items.length, matched });
  }, [focused, !!open]);

  // Not while the permission is read: without location the message shows at once, never after the mascot's trip.
  const loading = useMinDuration(
    list.isPending || location.status === "locating" || (location.status === "ready" && matched > 0 && compare.isPending),
    MIN_LOADER_MS,
  );
  const body = (() => {
    if (loading) return <ShoppingLoader label={t("compare.loading")} />;
    if (list.isError) return <EmptyState icon={TriangleAlert} title={t("compare.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.compareRetryList, onPress: () => list.refetch() }} />;
    if (!matched && items.length)
      // Missing items exist but none is matched to a product, so there is nothing to price yet.
      return (
        <EmptyState
          icon={ShoppingBasket}
          title={t("compare.unmatched.title")}
          body={fmt(t("compare.unmatched.body"), { n: items.length })}
          action={{ title: fmt(t("compare.unmatched.match"), { name: items[0].name }), analyticsName: Taps.compareMissingMatch, onPress: () => router.push({ pathname: "/item/[id]", params: { id: items[0].id, page: "product" } }), filled: true }}
        />
      );
    if (!matched) return <EmptyState icon={ShoppingBasket} title={t("compare.noBasket.title")} body={t("compare.noBasket.body")} />;
    // Reading the permission takes milliseconds (or waits on the first-time prompt): show nothing rather than a loader that flashes.
    if (location.status === "checking") return <></>;
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
    if (!open) {
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

  const rows = (stores: typeof sorted) =>
    stores.map((s) => (
      <Animated.View key={s.storeId} layout={reorder}>
        <StoreRow store={s} missing={missingCount(items, s)} onPress={() => setOpenId(s.storeId)} />
      </Animated.View>
    ));

  const subtitle = loading ? t("compare.searching") : matched ? fmt(t("compare.summary"), { items: items.length, matched }) : undefined;

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
        <LargeTitle title={t("tabs.compare")} subtitle={subtitle} nav={showControls && <RadiusMenu value={radiusKm} onChange={setRadiusKm} />} />
        {showControls && matched > 0 && (
          <SortControl
            value={sort}
            onChange={(s) => {
              setSort(s);
              setOpenId(null);
            }}
          />
        )}
        {body ?? (
          <>
            {!headed && <Group style={{ marginTop: space[4] }}>{rows(above)}</Group>}
            <Animated.View key={open.storeId} layout={reorder} entering={FadeIn.duration(motion.duration.fast)}>
              <BestStore
                store={open}
                basketSize={items.length}
                missing={missingCount(items, open)}
                saving={open === byPrice[0] ? saving(byPrice) : null}
                listText={listText}
                onShowBreakdown={() => router.push({ pathname: "/breakdown", params: { storeId: open.storeId } })}
              />
            </Animated.View>
            {below.length > 0 && (
              <Group title={headed ? t("compare.others") : undefined} count={headed ? below.length : undefined} style={headed ? undefined : { marginTop: space[4] }}>
                {rows(below)}
              </Group>
            )}
          </>
        )}
      </ScrollView>

      {toast}
    </Screen>
  );
}
