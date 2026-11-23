import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { SearchX, TriangleAlert } from "lucide-react-native";
import { useRef, useState } from "react";
import { View, type TextInputInstance } from "react-native";
import { RADII, useRadius } from "@/features/compare/api";
import { fmt } from "@/features/compare/format";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { EmptyState, LargeTitle, Screen, SearchField, Skeleton, Tap, Text } from "@/ui";
import { useSearchCards } from "./api";
import { CardGrid } from "./CardGrid";
import { GroupCard } from "./GroupCard";
import { LocationBanner, useBrowseLocation } from "./LocationBanner";
import { useSearchPanel } from "./useSearchPanel";

/**
 * Home → Search results: group cards, then single Products, for the query in `q`. Pushed inside the Home tab. Submitting
 * a new query in its field replaces `q` in place (no push), so back always returns to Home.
 */
export function SearchScreen() {
  const { q = "" } = useLocalSearchParams<{ q: string }>();
  const { space } = useTheme();
  const { location, coords, radiusKm, off, known } = useBrowseLocation();
  const setRadiusKm = useRadius((s) => s.set);
  const cards = useSearchCards(q, coords, radiusKm, known);
  const listId = useCurrentListId();
  const items = useList(listId, { poll: useIsFocused() }).data?.items ?? [];
  const data = cards.data ?? [];
  const loading = !known || cards.isPending;

  const [query, setQuery] = useState(q);
  const [focused, setFocused] = useState(false);
  const field = useRef<TextInputInstance>(null);
  const { panel, submitQuery } = useSearchPanel(query, setQuery, "results", (next) => {
    field.current?.blur();
    router.setParams({ q: next });
  });
  // The suggestions take the grid's place only while the User is editing the query.
  const suggesting = focused && query.trim() !== q;
  const cancel = () => {
    setQuery(q);
    field.current?.blur();
  };

  const subtitle = loading ? t("home.summary.loading") : fmt(t(off ? "home.search.summary.noLocation" : "home.search.summary"), { n: data.length, km: radiusKm });
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
      title={fmt(t(off ? "home.search.empty.noLocation" : "home.search.empty.title"), { q, km: radiusKm })}
      action={wider ? { title: fmt(t("compare.empty.widen"), { km: wider }), analyticsName: Taps.homeEmptyWiden, onPress: () => setRadiusKm(wider) } : undefined}
    />
  );

  return (
    <Screen edges={[]} style={{ paddingHorizontal: 0 }}>
      <CardGrid
        data={suggesting ? [] : data}
        keyOf={(c) => c.ref ?? c.code}
        header={
          <>
            <LargeTitle title={t("home.search.title")} subtitle={subtitle} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingBottom: space[3] }}>
              <SearchField
                ref={field}
                label={t("home.search.placeholder")}
                value={query}
                onChangeText={setQuery}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                returnKeyType="search"
                onSubmitEditing={submitQuery}
                containerStyle={{ flex: 1 }}
              />
              {focused && (
                <Tap accessibilityLabel={t("common.cancel")} analyticsName={Taps.homeSearchCancel} onPress={cancel} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text color="tint">{t("common.cancel")}</Text>
                </Tap>
              )}
            </View>
            {off && <LocationBanner location={location} />}
          </>
        }
        empty={suggesting ? panel : empty}
        render={(card) => <GroupCard card={card} type={card.type} listId={listId} items={items} />}
      />
    </Screen>
  );
}
