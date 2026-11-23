import { Navigation, SearchX, Tag, TriangleAlert } from "lucide-react-native";
import { Stack, useIsFocused, useLocalSearchParams } from "expo-router";
import { FlatList, View } from "react-native";
import { fmt, formatDistance, navigateLabel, shekels } from "@/features/compare/format";
import { ShelfPrice } from "@/features/compare/ShelfPrice";
import { priceLabel } from "@/features/items/labels";
import { ProductImage } from "@/features/items/ProductImage";
import { useProductImage } from "@/features/items/products";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { openWaze } from "@/lib/waze";
import { useTheme } from "@/theme";
import { EmptyState, Screen, SectionHeader, Skeleton, Tap, Text } from "@/ui";
import { useProductPage, type ProductPage, type ProductStore } from "./api";
import { productTypeOf, typeNameKey, type CardTarget } from "./card";
import { CardControls } from "./CardControls";
import { useBrowseLocation } from "./LocationBanner";
import { packSize } from "./ProductRow";
import { storeRow } from "./product-page";
import { useCard } from "./useCard";

/** One store's price in the scan sheet's price-row style: Chain, branch (and distance), price over its struck Shelf price, Promotion text. Waze when the store has a location. */
function StoreRow({ store, soldBy }: { store: ProductStore; soldBy: "unit" | "weight" }) {
  const { colors, space, radius, size } = useTheme();
  const row = storeRow(store);
  const price = priceLabel(row.price, soldBy, t);
  const branch = row.distanceKm === null ? store.storeName : `${store.storeName} · ${formatDistance(row.distanceKm, t)}`;
  const label = [
    row.waze ? navigateLabel(store, t) : fmt(t("home.product.storeLabel"), { store: `${store.chainName} ${store.storeName}`, price }),
    row.waze ? price : null,
    row.shelf !== null && fmt(t("compare.promo.insteadOf"), { price: shekels(row.shelf) }),
    row.promoText,
  ].filter(Boolean).join(", ");
  const body = (
    <>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text numberOfLines={1}>{store.chainName}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
          <Text variant="subhead" color={row.waze ? "tint" : "labelSecondary"} numberOfLines={1} style={{ flexShrink: 1 }}>{branch}</Text>
          {row.waze && <Navigation size={14} strokeWidth={1.75} color={colors.tint} />}
        </View>
        {row.promoText && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <Tag size={14} strokeWidth={1.75} color={colors.saving} />
            <Text variant="footnoteEmphasized" color="saving" style={{ flex: 1 }}>{row.promoText}</Text>
          </View>
        )}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text variant="priceRow" tabular color={row.shelf === null ? "label" : "saving"}>{priceLabel(row.price, soldBy, t)}</Text>
        {row.shelf !== null && <ShelfPrice price={row.shelf} variant="footnote" />}
      </View>
    </>
  );
  const style = { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.row, paddingHorizontal: space[5], paddingVertical: space[3], backgroundColor: colors.surface, borderRadius: radius.group } as const;
  return row.waze ? (
    <Tap
      accessibilityLabel={label}
      analyticsName={Taps.homeProductNavigate}
      onPress={() => void openWaze(row.waze!.lat, row.waze!.lng)}
      scaleTo={1}
      style={style}
    >
      {body}
    </Tap>
  ) : (
    <View accessible accessibilityLabel={label} style={style}>
      {body}
    </View>
  );
}

/** The Product's image, name and pack size, with its stepper and Add/Update (an Item on the List shows as on it). */
function ProductTop({ data }: { data: ProductPage }) {
  const { colors, space, radius } = useTheme();
  const { product } = data;
  const listId = useCurrentListId();
  const items = useList(listId, { poll: useIsFocused() }).data?.items ?? [];
  const target: CardTarget = { name: product.name, category: t(typeNameKey(product.type)), soldBy: product.soldBy, productCode: product.code };
  const { view, step, act } = useCard(target, listId, items, "home");
  const image = useProductImage(product.code);
  const size = packSize(product);
  return (
    <View style={{ gap: space[3], paddingBottom: space[4] }}>
      <View style={{ gap: space[4], padding: space[4], backgroundColor: colors.surface, borderRadius: radius.group }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[4] }}>
          <ProductImage url={image} style={{ width: 72, height: 72 }} />
          <View accessible accessibilityLabel={[product.name, size].filter(Boolean).join(", ")} style={{ flex: 1, gap: space[1] }}>
            <Text variant="title3" numberOfLines={3}>{product.name}</Text>
            {size && <Text variant="footnote" color="labelSecondary" numberOfLines={1}>{size}</Text>}
          </View>
        </View>
        <CardControls name={product.name} view={view} onStep={step} onAct={act} row />
      </View>
    </View>
  );
}

/**
 * A Product page, pushed inside the Home tab from a lone-Product card: the Product with its Add, then its price at each
 * store, cheapest first. A virtualized list: without a location every store in the country that prices it is listed.
 */
export function ProductScreen() {
  const params = useLocalSearchParams<{ code: string; type?: string }>();
  const { space } = useTheme();
  const { coords, radiusKm, known } = useBrowseLocation();
  const page = useProductPage(params.code, coords, radiusKm, known);
  const data = page.data;
  const type = productTypeOf(params.type);
  const stores = data?.stores ?? [];

  const empty = page.isError ? (
    <EmptyState icon={TriangleAlert} title={t("home.error.title")} action={{ title: t("compare.retry"), analyticsName: Taps.homeRetry, onPress: () => page.refetch() }} />
  ) : !data ? (
    <View style={{ gap: space[4] }}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} style={{ height: 72 }} />
      ))}
    </View>
  ) : (
    <EmptyState icon={SearchX} title={t("home.product.empty")} />
  );

  return (
    <Screen edges={[]} style={{ paddingHorizontal: 0 }}>
      <Stack.Screen options={{ headerBackTitle: t(typeNameKey(type)) }} />
      <FlatList
        data={stores}
        keyExtractor={(s, i) => `${s.chainName} ${s.storeName} ${i}`}
        renderItem={({ item }) => <StoreRow store={item} soldBy={data!.product.soldBy} />}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ flexGrow: 1, gap: space[2], paddingHorizontal: space[5], paddingBottom: space[9] }}
        ListHeaderComponent={
          <View style={{ gap: space[3] }}>
            {data && (
              <>
                <ProductTop data={data} />
                {stores.length > 0 && <SectionHeader title={t("home.product.stores")} count={stores.length} />}
              </>
            )}
          </View>
        }
        ListEmptyComponent={<>{empty}</>}
      />
    </Screen>
  );
}
