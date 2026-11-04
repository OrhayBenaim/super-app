import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import { SearchX, TriangleAlert } from "lucide-react-native";
import { View } from "react-native";
import { fmt } from "@/features/compare/format";
import { RADII, useRadius } from "@/features/compare/api";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { EmptyState, LargeTitle, Screen, Skeleton } from "@/ui";
import { useTypeCards } from "./api";
import { typeNameKey } from "./card";
import { CardGrid } from "./CardGrid";
import { GroupCard } from "./GroupCard";
import { LocationBanner, useBrowseLocation } from "./LocationBanner";

/** Home → a Product type: its group cards, most nearby stores first. Pushed inside the Home tab (back = Home). */
export function TypeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const type: ProductType = PRODUCT_TYPES.find((p) => p === id) ?? "other";
  const { space } = useTheme();
  const { location, coords, radiusKm, off, known } = useBrowseLocation();
  const setRadiusKm = useRadius((s) => s.set);
  const cards = useTypeCards(type, coords, radiusKm, known);
  const listId = useCurrentListId();
  // One poll for the screen keeps every card's "on the List" in step with the other Members.
  const items = useList(listId, { poll: useIsFocused() }).data?.items ?? [];
  const data = cards.data ?? [];
  const loading = !known || cards.isPending;

  const subtitle = loading ? t("home.summary.loading") : fmt(t(off ? "home.type.summary.noLocation" : "home.type.summary"), { n: data.length });
  const wider = RADII.find((r) => r > radiusKm);
  const empty = cards.isError ? (
    <EmptyState icon={TriangleAlert} title={t("home.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.homeRetry, onPress: () => cards.refetch() }} />
  ) : loading ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} style={{ width: "47%", flexGrow: 1, height: 274 }} />
      ))}
    </View>
  ) : (
    <EmptyState
      icon={SearchX}
      title={fmt(t("home.empty.title"), { km: radiusKm })}
      action={wider ? { title: fmt(t("compare.empty.widen"), { km: wider }), analyticsName: Taps.homeEmptyWiden, onPress: () => setRadiusKm(wider) } : undefined}
    />
  );

  return (
    <Screen edges={[]} style={{ paddingHorizontal: 0 }}>
      <CardGrid
        data={data}
        keyOf={(c) => c.ref}
        header={
          <>
            <LargeTitle title={t(typeNameKey(type))} subtitle={subtitle} />
            {off && <LocationBanner location={location} />}
          </>
        }
        empty={empty}
        render={(card) => <GroupCard card={card} type={type} listId={listId} items={items} />}
      />
    </Screen>
  );
}
