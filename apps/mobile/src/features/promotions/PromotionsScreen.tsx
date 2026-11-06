import type { ProductType } from "@grocer/shared/product-types";
import { useIsFocused } from "expo-router";
import { MapPin, Tag, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useRadius } from "@/features/compare/api";
import { fmt } from "@/features/compare/format";
import { openRadiusMenu } from "@/features/compare/RadiusMenu";
import { MenuButton } from "@/features/drawer/MenuButton";
import { typeNameKey } from "@/features/home/card";
import { CardGrid } from "@/features/home/CardGrid";
import { useBrowseLocation } from "@/features/home/LocationBanner";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useDelayed, useMinDuration } from "@/lib/loaderTiming";
import { useTheme } from "@/theme";
import { Button, COUPON_DIG_MS, CouponLoader, EmptyState, LargeTitle, Screen, Text } from "@/ui";
import { useChains, usePromotions } from "./api";
import { ChainMenu } from "./ChainMenu";
import { loadedCards, promoKey } from "./promo";
import { PromoCard } from "./PromoCard";
import { TypeBar } from "./TypeBar";

// A filter answer slower than this shows the loader; a faster one just swaps the cards.
const SLOW_SWITCH_MS = 300;

/** The Promotions tab: group cards of the Products on a Promotion nearby, biggest saving first, under the filters. */
export function PromotionsScreen() {
  const { space } = useTheme();
  const { location, coords, radiusKm, off } = useBrowseLocation();
  const setRadiusKm = useRadius((s) => s.set);
  const [type, setType] = useState<ProductType | null>(null);
  const [chain, setChain] = useState<string | null>(null);
  const promos = usePromotions(coords, radiusKm, type, chain);
  const chains = useChains().data ?? [];
  const listId = useCurrentListId();
  // One poll for the screen keeps every card's "on the List" in step with the other Members.
  const items = useList(listId, { poll: useIsFocused() }).data?.items ?? [];
  // A new type, Chain or radius keeps the old cards up (placeholder data); a slow one swaps them for the loader.
  const switching = useDelayed(!off && promos.isPlaceholderData, SLOW_SWITCH_MS);
  // A nearby search can answer at once; hold the loader for one dig cycle (both flings) so it never just flashes.
  const loading = useMinDuration(!off && (!coords || promos.isPending || switching), COUPON_DIG_MS);
  const data = off || loading ? [] : loadedCards(promos.data?.pages);
  // After a page fails, only the footer's retry loads it: scrolling would repeat the failing request unseen.
  const more = () => {
    if (promos.hasNextPage && !promos.isFetchingNextPage && !promos.isFetchNextPageError) void promos.fetchNextPage();
  };
  const pageFailed = promos.isFetchNextPageError && (
    <View style={{ alignItems: "center", gap: space[2], paddingTop: space[5] }}>
      <Text variant="subhead" color="labelSecondary">
        {t("promotions.error.title")}
      </Text>
      <Button
        title={t("compare.retry")}
        variant="tinted"
        analyticsName={Taps.promotionsRetry}
        loading={promos.isFetchingNextPage}
        onPress={() => void promos.fetchNextPage()}
      />
    </View>
  );

  const chainName = chains.find((c) => c.id === chain)?.name;
  const filteredTitle = type && chainName
    ? fmt(t("promotions.filtered.both"), { type: t(typeNameKey(type)), chain: chainName })
    : type
      ? fmt(t("promotions.filtered.type"), { type: t(typeNameKey(type)) })
      : fmt(t("promotions.filtered.chain"), { chain: chainName ?? "" });
  const clear = () => {
    setType(null);
    setChain(null);
  };

  const empty = off ? (
    location.status === "denied" ? (
      <EmptyState
        icon={MapPin}
        title={t("compare.location.title")}
        body={t("promotions.location.body")}
        action={{
          title: t(location.canAskAgain ? "compare.location.allow" : "compare.location.settings"),
          analyticsName: location.canAskAgain ? Taps.promotionsLocationAllow : Taps.promotionsLocationSettings,
          onPress: location.request,
          filled: true,
        }}
      />
    ) : (
      <EmptyState icon={TriangleAlert} title={t("compare.location.error")} action={{ title: t("compare.retry"), analyticsName: Taps.promotionsLocationRetry, onPress: location.refresh }} />
    )
  ) : promos.isError ? (
    <EmptyState icon={TriangleAlert} title={t("promotions.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.promotionsRetry, onPress: () => promos.refetch() }} />
  ) : loading ? (
    <CouponLoader label={t("promotions.loading")} />
  ) : type || chain ? (
    <EmptyState icon={Tag} title={filteredTitle} body={t("promotions.filtered.body")} action={{ title: t("promotions.filtered.clear"), analyticsName: Taps.promotionsClearFilter, onPress: clear }} />
  ) : (
    <EmptyState
      icon={Tag}
      title={t("promotions.empty.title")}
      body={fmt(t("promotions.empty.body"), { km: radiusKm })}
      action={{ title: t("promotions.empty.radius"), analyticsName: Taps.promotionsEmptyRadius, onPress: () => openRadiusMenu(radiusKm, setRadiusKm) }}
    />
  );

  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      <CardGrid
        data={data}
        keyOf={promoKey}
        onEndReached={more}
        footer={pageFailed}
        header={
          <>
            <LargeTitle
              start={<MenuButton />}
              nav={!off && <ChainMenu chains={chains} value={chain} onChange={setChain} />}
              title={t("tabs.promotions")}
              subtitle={fmt(t("promotions.subtitle"), { km: radiusKm })}
            />
            {!off && <TypeBar value={type} onChange={setType} />}
          </>
        }
        empty={empty}
        render={(card) => <PromoCard card={card} listId={listId} items={items} oneChain={chain !== null} />}
      />
    </Screen>
  );
}
