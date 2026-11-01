import { MapPin, SearchX, ShoppingBasket, TriangleAlert } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { ItemSheet } from "@/features/items/ItemSheet";
import { useDeleteWithUndo } from "@/features/items/useDeleteWithUndo";
import { missingCodes, missingItems, useCurrentListId, useList, type Item } from "@/features/lists/api";
import { syncGeofences, useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { useLocation } from "@/lib/location";
import { t } from "@/lib/strings";
import { springs, useTheme } from "@/theme";
import { EmptyState, Group, LargeTitle, Screen } from "@/ui";
import { RADII, useCompare, useRadius } from "./api";
import { BestStore, StoreRow } from "./BestStore";
import { fmt } from "./format";
import { MissingSheet } from "./MissingSheet";
import { RadiusMenu } from "./RadiusMenu";
import { CompareSkeleton } from "./Skeleton";
import { saving, sortStores, type Sort } from "./sort";
import { SortControl } from "./SortControl";

// Rows glide to their new slot when the sort changes; snappy matches the segmented thumb.
const reorder = LinearTransition.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness).mass(springs.snappy.mass);

export function CompareScreen() {
  const { space, colors } = useTheme();
  const [sort, setSort] = useState<Sort>("price");
  const { km: radiusKm, set: setRadiusKm } = useRadius();
  const [pulling, setPulling] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [matching, setMatching] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });

  const listId = useCurrentListId();
  const list = useList(listId, { poll: false });
  const items = missingItems(list.data);
  const codes = missingCodes(list.data);
  const location = useLocation();
  const compare = useCompare(location.coords, radiusKm, codes);
  const { enabled: alertsOn } = useNearbyAlerts();
  const { deleteItem, toast } = useDeleteWithUndo(listId);

  const byPrice = useMemo(() => sortStores(compare.data?.stores ?? [], "price"), [compare.data]);
  const best = byPrice[0];
  const others = useMemo(() => sortStores(byPrice.slice(1), sort), [byPrice, sort]);
  const listText = items.map((i) => i.name).join("\n");

  // Deps are only the fetch stamp and the flag: re-sync per fetch, not per render.
  // Fresh results: re-arm nearby alerts on the same basket. Best-effort; a failure just keeps the old geofences.
  useEffect(() => {
    if (alertsOn && location.coords && compare.dataUpdatedAt) syncGeofences(location.coords, codes).catch(() => {});
  }, [compare.dataUpdatedAt, alertsOn]);

  const loading = list.isPending || location.status === "checking" || location.status === "locating" || (location.status === "ready" && codes.length > 0 && compare.isPending);
  const body = (() => {
    if (loading) return <CompareSkeleton />;
    if (list.isError) return <EmptyState icon={TriangleAlert} title={t("compare.error.title")} action={{ title: t("compare.retry"), onPress: () => list.refetch() }} />;
    if (!codes.length) return <EmptyState icon={ShoppingBasket} title={t("compare.noBasket.title")} body={t("compare.noBasket.body")} />;
    if (location.status === "denied")
      return (
        <EmptyState
          icon={MapPin}
          title={t("compare.location.title")}
          body={t("compare.location.body")}
          action={{ title: t(location.canAskAgain ? "compare.location.allow" : "compare.location.settings"), onPress: location.request, filled: true }}
        />
      );
    if (location.status === "error") return <EmptyState icon={TriangleAlert} title={t("compare.location.error")} action={{ title: t("compare.retry"), onPress: location.refresh }} />;
    if (compare.isError) return <EmptyState icon={TriangleAlert} title={t("compare.error.title")} action={{ title: t("compare.retry"), onPress: () => compare.refetch() }} />;
    if (!best) {
      const wider = RADII.find((r) => r > radiusKm);
      return (
        <EmptyState
          icon={SearchX}
          title={fmt(t("compare.empty.title"), { km: radiusKm })}
          body={t("compare.empty.body")}
          action={wider ? { title: fmt(t("compare.empty.widen"), { km: wider }), onPress: () => setRadiusKm(wider) } : undefined}
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
            <BestStore store={best} basketSize={items.length} saving={saving(byPrice)} listText={listText} onShowMissing={() => setMissingOpen(true)} />
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

      <MissingSheet
        open={missingOpen}
        onClose={() => setMissingOpen(false)}
        store={best ?? null}
        items={items}
        onMatch={(item) => {
          setMissingOpen(false);
          setMatching({ open: true, item });
        }}
      />
      <ItemSheet open={matching.open} item={matching.item} page="product" listId={listId} onDelete={deleteItem} onClose={() => setMatching((s) => ({ ...s, open: false }))} />
      {toast}
    </Screen>
  );
}
