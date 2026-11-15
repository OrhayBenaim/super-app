import { Navigation, Tag } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, ScrollView, View } from "react-native";
import { useRadius } from "@/features/compare/api";
import { formatDistance, shekels } from "@/features/compare/format";
import { ShelfPrice } from "@/features/compare/ShelfPrice";
import { Taps } from "@/lib/analytics";
import { currentLocation, lastKnownLocation, type Coords } from "@/lib/location";
import { t } from "@/lib/strings";
import { openWaze } from "@/lib/waze";
import { useTheme } from "@/theme";
import { Group, SectionHeader, Tap, Text } from "@/ui";
import { pricesNearby, shownPrice, storeLabel, type ScannedProduct, type ScanPrices, type ScanStore } from "./scan";

/** The found Product's prices, `undefined` until the first Compare answers. `settling` while they come from the last known position (maybe stale); a fresh fix then prices them again. */
type Nearby = { prices?: ScanPrices; settling: boolean };

function useNearbyPrices({ code, soldBy }: ScannedProduct): Nearby {
  const [nearby, setNearby] = useState<Nearby>({ settling: true });
  useEffect(() => {
    let live = true;
    const radiusKm = useRadius.getState().km;
    const priceAt = (at: Coords | null) => pricesNearby(code, soldBy, at && { ...at, radiusKm });
    (async () => {
      const last = await lastKnownLocation();
      if (last) {
        const prices = await priceAt(last);
        if (live) setNearby({ prices, settling: true });
      }
      const fresh = await currentLocation();
      // No fresh fix keeps the last known prices; with neither, location is off.
      const prices = fresh || !last ? await priceAt(fresh) : undefined;
      if (!live) return;
      setNearby((n) => ({ prices: prices ?? n.prices, settling: false }));
      if (prices?.kind === "stores") AccessibilityInfo.announceForAccessibility(`${prices.headline.chainName}, ${shekels(shownPrice(prices.headline))}`);
    })();
    return () => {
      live = false;
    };
  }, [code, soldBy]);
  return nearby;
}

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

/** The cheapest store: Chain, where (a spinner while the fix settles), then the price in Price Hero (Saving green over the struck Shelf price and the Promotion text when promoted). */
function Headline({ store, settling }: { store: ScanStore; settling: boolean }) {
  const { colors, space, radius, size } = useTheme();
  const { promo } = store;
  return (
    <Tap {...navigateTap(store)} style={{ backgroundColor: colors.surface, borderRadius: radius.group, padding: space[5], gap: space[1], minHeight: size.row }}>
      <Text variant="title3" numberOfLines={1}>{store.chainName}</Text>
      {settling ? <ActivityIndicator size="small" color={colors.labelSecondary} accessibilityLabel={t("items.scan.locating")} style={{ alignSelf: "flex-start" }} /> : <BranchLine store={store} />}
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

function OtherBranchRow({ store, settling }: { store: ScanStore; settling: boolean }) {
  const { space, size } = useTheme();
  return (
    <Tap {...navigateTap(store)} style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.row, paddingHorizontal: space[5], paddingVertical: space[3] }}>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text numberOfLines={1}>{store.chainName}</Text>
        {!settling && <BranchLine store={store} />}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text variant="priceRow" tabular color={store.promo ? "saving" : "label"}>{shekels(shownPrice(store))}</Text>
        {store.promo && <ShelfPrice price={store.price} variant="footnote" />}
      </View>
    </Tap>
  );
}

const NO_PRICES = { noLocation: "items.scan.noLocation", failed: "items.scan.pricesFailed", none: "items.scan.noStore" } as const;

/**
 * The prices part of the found view: a spinner until the first Compare answers, then the headline and the others, or one
 * secondary line saying why there are none. Only the others shrink and scroll, so the view's pinned button stays on screen.
 */
export function ScanPricesView({ product }: { product: ScannedProduct }) {
  const { colors, space, radius } = useTheme();
  const { prices, settling } = useNearbyPrices(product);
  if (!prices) return <ActivityIndicator color={colors.labelSecondary} accessibilityLabel={t("items.scan.locating")} style={{ paddingVertical: space[5] }} />;
  if (prices.kind !== "stores") return <Text variant="subhead" color="labelSecondary" style={{ textAlign: "center" }}>{t(NO_PRICES[prices.kind])}</Text>;
  return (
    <View style={{ flexShrink: 1, gap: space[4] }}>
      <Headline store={prices.headline} settling={settling} />
      {prices.others.length > 0 && (
        <View style={{ flexShrink: 1 }}>
          <SectionHeader title={t("compare.others")} count={prices.others.length} />
          <ScrollView style={{ flexShrink: 1, borderRadius: radius.group }} nestedScrollEnabled>
            <Group>
              {prices.others.map((s, i) => (
                <OtherBranchRow key={i} store={s} settling={settling} />
              ))}
            </Group>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
