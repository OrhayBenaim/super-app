import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import { Stack, useIsFocused, useLocalSearchParams } from "expo-router";
import { TriangleAlert } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { fmt } from "@/features/compare/format";
import { formatQuantity, fromPrice, groupTitle } from "@/features/items/labels";
import { ProductImage } from "@/features/items/ProductImage";
import { useProductImage } from "@/features/items/products";
import { useCurrentListId, useList, type Item } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { EmptyState, Group, LargeTitle, Screen, Skeleton, Text } from "@/ui";
import { useGroupPage, type GroupPage } from "./api";
import { typeNameKey } from "./card";
import { CardControls } from "./CardControls";
import { groupTarget } from "./card";
import { LocationBanner, useBrowseLocation } from "./LocationBanner";
import { ProductRow } from "./ProductRow";
import { useCard, type CardScreen } from "./useCard";

/**
 * A group card's product page, pushed inside the Home tab (back = its Product type): the group's own stepper and
 * Add/Update at the top, then every Product of the group sold nearby, each with its own controls.
 */
export function GroupScreen() {
  const params = useLocalSearchParams<{ ref: string; type: string }>();
  const type: ProductType = PRODUCT_TYPES.find((p) => p === params.type) ?? "other";
  const { space } = useTheme();
  const { location, coords, radiusKm, off, known } = useBrowseLocation();
  const page = useGroupPage(type, params.ref, coords, radiusKm, known);
  const listId = useCurrentListId();
  // One poll for the page keeps every row's "on the List" in step with the other Members.
  const items = useList(listId, { poll: useIsFocused() }).data?.items ?? [];
  const data = page.data;
  const card = data?.card;

  const subtitle = card ? [card.minPrice === null ? null : fromPrice(card.measure, card.minPrice, t), fmt(t("items.product.stores"), { n: card.storeCount })].filter(Boolean).join(" · ") : undefined;
  return (
    <Screen edges={[]} scroll style={{ gap: space[4], paddingBottom: space[9] }}>
      <Stack.Screen options={{ headerBackTitle: t(typeNameKey(type)) }} />
      {data ? (
        <>
          <LargeTitle title={groupTitle(data.card, t)} subtitle={subtitle} />
          {off && <LocationBanner location={location} />}
          <GroupTop page={data} type={type} listId={listId} items={items} />
          <Group title={t(off ? "home.product.section.noLocation" : "home.product.section")} count={data.products.length}>
            {data.products.map((p) => (
              <ProductRow key={p.code} product={p} group={groupTarget(data.card, type)} listId={listId} items={items} />
            ))}
          </Group>
        </>
      ) : page.isError ? (
        <EmptyState icon={TriangleAlert} title={t("home.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.homeRetry, onPress: () => page.refetch() }} />
      ) : (
        <View style={{ gap: space[4], paddingTop: space[9] }}>
          <Skeleton style={{ height: 80 }} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 127 }} />
          ))}
        </View>
      )}
    </Screen>
  );
}

/** The whole group's image, stepper and Add/Update, with a line on what Adding the group means or what is on the List. */
export function GroupTop({ page, type, listId, items, screen = "home" }: { page: GroupPage; type: ProductType; listId: string | null; items: Item[]; screen?: CardScreen }) {
  const { colors, space, radius } = useTheme();
  const target = groupTarget(page.card, type);
  const { view, step, act } = useCard(target, listId, items, screen);
  const image = useProductImage(page.card.code);
  const held = view.action === "add" ? null : view.item!;
  const heldName = held && (page.products.find((p) => p.code === held.productCode)?.name ?? held.name);
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], padding: space[4], backgroundColor: colors.surface, borderRadius: radius.group }}>
        <ProductImage url={image} style={{ width: 56, height: 56 }} />
        <View style={{ flex: 1 }}>
          <CardControls name={target.name} view={view} onStep={step} onAct={act} row />
        </View>
      </View>
      <Text variant="footnote" color="labelSecondary" style={{ paddingHorizontal: space[5] }}>
        {held
          ? fmt(t("home.product.matched"), { name: heldName!, quantity: formatQuantity(held.quantity, held.soldBy, t) })
          : fmt(t("home.product.hint"), { name: target.name })}
      </Text>
    </View>
  );
}
