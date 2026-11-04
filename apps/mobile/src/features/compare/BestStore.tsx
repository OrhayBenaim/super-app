import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { openWaze } from "@/lib/waze";
import { useTheme } from "@/theme";
import { Button, Group, Row, Tap, Text } from "@/ui";
import { fmt, formatDistance, shekels } from "./format";
import type { StoreResult } from "./sort";

type Props = {
  store: StoreResult;
  /** Items on the list (the whole basket, priced or not). */
  basketSize: number;
  /** Of those, the items this store does not price (missingCount). */
  missing: number;
  saving: { amount: number; chainName: string } | null;
  /** Shopping-list item names, copied for pasting into the shop's search. */
  listText: string;
  onShowBreakdown: () => void;
};

/** The app's answer: cheapest branch, its total in Price Hero, the saving, honest coverage, Navigate and Order online. */
export function BestStore({ store, basketSize, missing, saving, listText, onShowBreakdown }: Props) {
  const { space, motion } = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const coverage = missing
    ? fmt(t("compare.coverage.partial"), { n: basketSize - missing, m: basketSize, missing })
    : fmt(t("compare.breakdown.row"), { n: basketSize });

  const selected = (action: "navigate" | "order") => track(Events.compareStoreSelected, { chainId: store.chainId, action });
  const order = async () => {
    if (!store.orderUrl) return;
    selected("order");
    // A shop without a cart link gets the list via the clipboard (docs/research/price-data.md §6).
    if (!store.fillsCart) {
      await Clipboard.setStringAsync(listText);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), motion.duration.toast);
    }
    await Linking.openURL(store.orderUrl);
  };

  return (
    <Group style={{ marginTop: space[4] }}>
      <View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[4], padding: space[5], paddingBottom: space[2] }}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text variant="title3" numberOfLines={1}>
              {store.chainName}
            </Text>
            <Text variant="subhead" color="labelSecondary" numberOfLines={1}>
              {store.storeName} · {formatDistance(store.distanceKm, t)}
            </Text>
            {saving && (
              <Text variant="subhead" color="saving" style={{ fontWeight: "600" }}>
                {fmt(t("compare.saving"), { amount: shekels(saving.amount), chain: saving.chainName })}
              </Text>
            )}
          </View>
          <Text variant="priceHero" accessibilityLabel={fmt(t("compare.total"), { total: shekels(store.total) })}>
            {shekels(store.total)}
          </Text>
        </View>
        <Row title={coverage} titleColor={missing ? "warning" : "tint"} chevron accessibilityHint={t("compare.breakdown.hint")} analyticsName={Taps.compareBreakdown} onPress={onShowBreakdown} />
        <View style={{ gap: space[2], padding: space[5], paddingTop: space[2] }}>
          <Button title={t("compare.navigate")} analyticsName={Taps.compareNavigate} accessibilityLabel={fmt(t("compare.navigateTo"), { store: `${store.chainName} ${store.storeName}` })} haptic onPress={() => {
            selected("navigate");
            void openWaze(store.lat, store.lng);
          }} />
          <Button title={t("compare.order")} analyticsName={Taps.compareOrder} variant="plain" disabled={!store.orderUrl} onPress={order} />
          {!store.orderUrl && (
            <Text variant="footnote" color="labelSecondary" style={{ textAlign: "center" }}>
              {t("compare.noShop")}
            </Text>
          )}
          {copied && (
            <Animated.View entering={FadeIn.duration(motion.duration.fast)} exiting={FadeOut.duration(motion.duration.fast)}>
              <Text variant="footnote" color="labelSecondary" accessibilityLiveRegion="polite" style={{ textAlign: "center" }}>
                {t("compare.copied")}
              </Text>
            </Animated.View>
          )}
        </View>
      </View>
    </Group>
  );
}

/** "Other branches" row: chain, branch · distance, amber missing count when partial, trailing tabular price. Tap opens it as the card. */
export function StoreRow({ store, missing, onPress }: { store: StoreResult; missing: number; onPress: () => void }) {
  const { space, size } = useTheme();
  return (
    <Tap
      // The label replaces the row's text for screen readers, so it must keep the missing count (honest coverage).
      accessibilityLabel={[`${store.chainName} ${store.storeName}`, formatDistance(store.distanceKm, t), shekels(store.total), missing > 0 && fmt(t("compare.missingCount"), { n: missing })]
        .filter(Boolean)
        .join(", ")}
      analyticsName={Taps.compareStore}
      onPress={onPress}
      scaleTo={1}
      style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.row, paddingHorizontal: space[5], paddingVertical: space[3] }}
    >
      <View style={{ flex: 1, gap: space[1] }}>
        <Text numberOfLines={1}>{store.chainName}</Text>
        <Text variant="subhead" color="labelSecondary" numberOfLines={1}>
          {store.storeName} · {formatDistance(store.distanceKm, t)}
        </Text>
      </View>
      {missing > 0 && (
        <Text variant="subhead" color="warning" tabular>
          {fmt(t("compare.missingCount"), { n: missing })}
        </Text>
      )}
      <Text variant="priceRow">{shekels(store.total)}</Text>
    </Tap>
  );
}
