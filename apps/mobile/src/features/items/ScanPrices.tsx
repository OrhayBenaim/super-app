import { Navigation, Tag } from "lucide-react-native";
import { View } from "react-native";
import { formatDistance, shekels } from "@/features/compare/format";
import { ShelfPrice } from "@/features/compare/ShelfPrice";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { openWaze } from "@/lib/waze";
import { useTheme } from "@/theme";
import { Group, Tap, Text } from "@/ui";
import { shownPrice, storeLabel, type ScanPrices, type ScanStore } from "./scan";

/** "branch · distance" as a link line (Tint, then the navigation icon at its end); its row or group opens Waze. */
function BranchLine({ store }: { store: ScanStore }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
      <Text variant="subhead" color="tint" numberOfLines={1} style={{ flexShrink: 1 }}>
        {store.storeName} · {formatDistance(store.distanceKm, t)}
      </Text>
      <Navigation size={14} strokeWidth={1.75} color={colors.tint} />
    </View>
  );
}

/** What both store touchables share: the Waze label and tap. */
const navigateTap = (store: ScanStore) => ({
  accessibilityLabel: storeLabel(store),
  analyticsName: Taps.itemsScanNavigate,
  onPress: () => void openWaze(store.lat, store.lng),
  scaleTo: 1 as const,
});

/** The cheapest store: Chain, where, then the price in Price Hero (Saving green over the struck Shelf price and the Promotion text when promoted). */
function Headline({ store }: { store: ScanStore }) {
  const { colors, space, radius, size } = useTheme();
  const { promo } = store;
  return (
    <Tap {...navigateTap(store)} style={{ backgroundColor: colors.surface, borderRadius: radius.group, padding: space[5], gap: space[1], minHeight: size.row }}>
      <Text variant="title3" numberOfLines={1}>{store.chainName}</Text>
      <BranchLine store={store} />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2], marginTop: space[2] }}>
        <Text variant="priceHero" tabular color={promo ? "saving" : "label"}>{shekels(shownPrice(store))}</Text>
        {promo && <ShelfPrice price={store.price} variant="subhead" />}
      </View>
      {promo && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Tag size={16} strokeWidth={1.75} color={colors.saving} />
          <Text variant="footnoteEmphasized" color="saving" style={{ flex: 1 }}>{promo.text}</Text>
        </View>
      )}
    </Tap>
  );
}

function OtherBranchRow({ store }: { store: ScanStore }) {
  const { space, size } = useTheme();
  return (
    <Tap {...navigateTap(store)} style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.row, paddingHorizontal: space[5], paddingVertical: space[3] }}>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text numberOfLines={1}>{store.chainName}</Text>
        <BranchLine store={store} />
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text variant="priceRow" tabular color={store.promo ? "saving" : "label"}>{shekels(shownPrice(store))}</Text>
        {store.promo && <ShelfPrice price={store.price} variant="footnote" />}
      </View>
    </Tap>
  );
}

const NO_PRICES = { noLocation: "items.scan.noLocation", failed: "items.scan.pricesFailed", none: "items.scan.noStore" } as const;

/** The prices part of the found view: the headline and the others (a Group that scrolls past 4 rows, so the pinned button stays on screen), or one secondary line saying why there are none. */
export function ScanPricesView({ prices }: { prices: ScanPrices }) {
  const { space } = useTheme();
  if (prices.kind !== "stores") return <Text variant="subhead" color="labelSecondary" style={{ textAlign: "center" }}>{t(NO_PRICES[prices.kind])}</Text>;
  return (
    <View style={{ gap: space[4] }}>
      <Headline store={prices.headline} />
      {prices.others.length > 0 && (
        <Group title={t("compare.others")} count={prices.others.length} maxRows={4}>
          {prices.others.map((s, i) => (
            <OtherBranchRow key={i} store={s} />
          ))}
        </Group>
      )}
    </View>
  );
}
