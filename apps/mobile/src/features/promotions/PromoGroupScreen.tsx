import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import { TriangleAlert } from "lucide-react-native";
import { Fragment } from "react";
import { View } from "react-native";
import { groupTarget } from "@/features/home/GroupCard";
import { GroupTop } from "@/features/home/GroupScreen";
import { LocationBanner, useBrowseLocation } from "@/features/home/LocationBanner";
import { ProductRow } from "@/features/home/ProductRow";
import { groupTitle } from "@/features/items/labels";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Divider, EmptyState, LargeTitle, Screen, SectionHeader, Skeleton } from "@/ui";
import { useChains, usePromotionPage } from "./api";
import { ChainPromoRow, chainIndent } from "./ChainPromoRow";
import { pageSubtitle } from "./promo";

/**
 * A Promotions card's product page, pushed inside the Promotions tab: the group's stepper and Add/Update at the top
 * (as on Home), then only its Products on a Promotion nearby, each with its own controls and one line per Chain.
 */
export function PromoGroupScreen() {
  const params = useLocalSearchParams<{ ref: string; type: string }>();
  const type: ProductType = PRODUCT_TYPES.find((p) => p === params.type) ?? "other";
  const { colors, space, radius } = useTheme();
  const { location, coords, radiusKm, off } = useBrowseLocation();
  const page = usePromotionPage(type, params.ref, coords, radiusKm);
  const chains = useChains().data ?? [];
  const listId = useCurrentListId();
  // One poll for the page keeps every row's "on the List" in step with the other Members.
  const items = useList(listId, { poll: useIsFocused() }).data?.items ?? [];
  const data = page.data;
  const chainName = (id: string) => chains.find((c) => c.id === id)?.nameHe ?? "";

  return (
    <Screen edges={[]} scroll style={{ gap: space[4], paddingBottom: space[9] }}>
      {off && <LocationBanner location={location} />}
      {data ? (
        <>
          <LargeTitle title={groupTitle(data.card, t)} subtitle={pageSubtitle(data.card, t)} />
          <GroupTop page={data} type={type} listId={listId} items={items} screen="promotions" />
          <View>
            <SectionHeader title={t("promotions.page.section")} count={data.products.length} />
            <View style={{ gap: space[4] }}>
              {data.products.map((p) => (
                <View key={p.code} style={{ backgroundColor: colors.surface, borderRadius: radius.group, overflow: "hidden" }}>
                  {/* The Chain lines below carry the prices. */}
                  <ProductRow product={{ ...p, minPrice: null }} group={groupTarget(data.card, type)} listId={listId} items={items} screen="promotions" />
                  {p.chains.map((c, i) => (
                    <Fragment key={c.chainId}>
                      <Divider style={{ marginStart: i === 0 ? space[5] : chainIndent(space) }} />
                      <ChainPromoRow promo={c} chainName={chainName(c.chainId)} soldBy={p.soldBy} />
                    </Fragment>
                  ))}
                </View>
              ))}
            </View>
          </View>
        </>
      ) : page.isError ? (
        <EmptyState icon={TriangleAlert} title={t("promotions.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.promotionsRetry, onPress: () => page.refetch() }} />
      ) : (
        !off && (
          <View style={{ gap: space[4], paddingTop: space[9] }}>
            <Skeleton style={{ height: 80 }} />
            {[0, 1].map((i) => (
              <Skeleton key={i} style={{ height: 200 }} />
            ))}
          </View>
        )
      )}
    </Screen>
  );
}
