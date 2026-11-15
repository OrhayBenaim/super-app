import { Navigation, Tag } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { fmt, formatDistance, shekels } from "@/features/compare/format";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Divider, SectionHeader, Text } from "@/ui";
import type { ScanPrices, ScanStore } from "./scan";

/** "branch · distance" as a link line (Tint, navigation icon): the line #228 makes tappable with its row. */
function Where({ store }: { store: ScanStore }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
      <Navigation size={14} strokeWidth={1.75} color={colors.tint} />
      <Text variant="subhead" color="tint" numberOfLines={1} style={{ flexShrink: 1 }}>
        {store.storeName} · {formatDistance(store.distanceKm, t)}
      </Text>
    </View>
  );
}

// The struck Shelf price, as in the Basket breakdown: Secondary Label, read as "במקום ₪X".
const Shelf = ({ price, variant }: { price: number; variant: "footnote" | "subhead" }) => (
  <Text variant={variant} color="labelSecondary" tabular style={{ textDecorationLine: "line-through" }} accessibilityLabel={fmt(t("compare.promo.insteadOf"), { price: shekels(price) })}>
    {shekels(price)}
  </Text>
);

/** The cheapest store: Chain, where, then the price in Price Hero (Saving green over the struck Shelf price and the Promotion text when promoted). */
function Headline({ store }: { store: ScanStore }) {
  const { colors, space, radius } = useTheme();
  const { promo } = store;
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.group, padding: space[5], gap: space[1] }}>
      <Text variant="title3" numberOfLines={1}>{store.chainName}</Text>
      <Where store={store} />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: space[2] }}>
        <Text variant="priceHero" tabular color={promo ? "saving" : "label"}>{shekels(promo?.price ?? store.price)}</Text>
        {promo && <Shelf price={store.price} variant="subhead" />}
      </View>
      {promo && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Tag size={16} strokeWidth={1.75} color={colors.saving} />
          <Text variant="footnoteEmphasized" color="saving" style={{ flex: 1 }}>{promo.text}</Text>
        </View>
      )}
    </View>
  );
}

function StoreRow({ store }: { store: ScanStore }) {
  const { space, size } = useTheme();
  const { promo } = store;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.row, paddingHorizontal: space[5], paddingVertical: space[3] }}>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text numberOfLines={1}>{store.chainName}</Text>
        <Where store={store} />
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text variant="priceRow" tabular color={promo ? "saving" : "label"}>{shekels(promo?.price ?? store.price)}</Text>
        {promo && <Shelf price={store.price} variant="footnote" />}
      </View>
    </View>
  );
}

/** Other branches: a header with the count, then the rows. Only this list scrolls; its cap keeps the pinned button on screen. */
function OtherBranches({ stores }: { stores: ScanStore[] }) {
  const { colors, space, radius } = useTheme();
  if (!stores.length) return null;
  return (
    <View>
      <SectionHeader title={t("compare.others")} count={stores.length} />
      <ScrollView nestedScrollEnabled style={{ maxHeight: 240, backgroundColor: colors.surface, borderRadius: radius.group }}>
        {stores.map((s, i) => (
          <View key={i}>
            {i > 0 && <Divider style={{ marginStart: space[5] }} />}
            <StoreRow store={s} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const LINES = { noLocation: "items.scan.noLocation", failed: "items.scan.pricesFailed", none: "items.scan.noStore" } as const;

/** The prices part of the found view: the headline and the others, or one secondary line saying why there are none. */
export function ScanPricesView({ prices }: { prices: ScanPrices }) {
  const { space } = useTheme();
  if (prices.kind !== "stores") return <Text variant="subhead" color="labelSecondary" style={{ textAlign: "center" }}>{t(LINES[prices.kind])}</Text>;
  return (
    <View style={{ gap: space[4] }}>
      <Headline store={prices.headline} />
      <OtherBranches stores={prices.others} />
    </View>
  );
}
