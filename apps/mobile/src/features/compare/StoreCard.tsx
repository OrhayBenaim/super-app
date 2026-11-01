import * as Clipboard from "expo-clipboard";
import { Navigation, ShoppingCart } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";
import { t } from "@/lib/strings";
import { openWaze } from "@/lib/waze";
import { springs, tokens, useTheme } from "@/theme";
import { Button, Tap, Text } from "@/ui";
import { fmt, shekels } from "./format";
import type { StoreResult } from "./sort";

const EASE_OUT = Easing.bezier(...(tokens.motion.easing.out as [number, number, number, number]));

// Rare (one card per result set) and it marks the winner: the delight budget. Never from scale(0).
const badgeIn: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.8 }] },
    animations: {
      opacity: withTiming(1, { duration: tokens.motion.duration.fast }),
      transform: [{ scale: withSpring(1, springs.bouncy) }],
    },
  };
};

type Props = {
  store: StoreResult;
  basketSize: number;
  best: boolean;
  /** productCode -> item name, for the missing list. */
  names: Map<string, string>;
  /** Shopping-list item names, copied for pasting into the shop's search. */
  listText: string;
};

export function StoreCard({ store, basketSize, best, names, listText }: Props) {
  const { colors, radius, space, font, shadow, motion } = useTheme();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const missing = store.missingCodes.length;
  const label = `${store.chainName} ${store.storeName}`;

  const order = async () => {
    if (!store.orderUrl) return;
    // No chain exposes add-to-cart links (docs/research/price-data.md §6): hand over the list via the clipboard.
    await Clipboard.setStringAsync(listText);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), motion.duration.toast);
    await Linking.openURL(store.orderUrl);
  };

  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], gap: space[5] }, shadow.sm]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[4] }}>
        <View style={{ flex: 1, gap: space[1] }}>
          {best && (
            <Animated.View
              entering={badgeIn}
              style={{ alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: space[4], paddingVertical: space[1], marginBottom: space[2] }}
            >
              <Text variant="caption" color="onAccentSoft" style={{ fontWeight: "600" }}>
                {t("compare.best")}
              </Text>
            </Animated.View>
          )}
          <Text variant="headline" numberOfLines={1}>
            {store.chainName}
          </Text>
          <Text variant="subhead" color="textSecondary" numberOfLines={1}>
            {store.storeName} · <Text variant="subhead" color="textSecondary" tabular>{fmt(t("compare.km"), { km: store.distanceKm.toFixed(1) })}</Text>
          </Text>
        </View>
        <Text variant="title1" style={{ fontVariant: font.variant.price as ["tabular-nums"] }}>
          {shekels(store.total)}
        </Text>
      </View>

      <View style={{ gap: space[3] }}>
        <Text variant="footnote" color={missing ? "warning" : "textSecondary"} tabular>
          {fmt(t("compare.has"), { n: store.matched, m: basketSize })}
        </Text>
        <Coverage ratio={basketSize ? store.matched / basketSize : 0} />
        {missing > 0 && (
          <Tap accessibilityLabel={open ? t("compare.hideMissing") : fmt(t("compare.showMissing"), { n: missing })} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} hitSlop={8} style={{ alignSelf: "flex-start" }}>
            <Text variant="footnote" color="primary" style={{ fontWeight: "600" }}>
              {open ? t("compare.hideMissing") : fmt(t("compare.showMissing"), { n: missing })}
            </Text>
          </Tap>
        )}
        {open && (
          <Animated.View entering={FadeIn.duration(motion.duration.base)} exiting={FadeOut.duration(motion.duration.fast)} style={{ gap: space[1] }}>
            {store.missingCodes.map((code) => (
              <Text key={code} variant="footnote" color="textSecondary">
                · {names.get(code) ?? code}
              </Text>
            ))}
          </Animated.View>
        )}
      </View>

      <View style={{ gap: space[3] }}>
        <View style={{ flexDirection: "row", gap: space[3] }}>
          <Button title={t("compare.order")} icon={ShoppingCart} disabled={!store.orderUrl} onPress={order} style={{ flex: 1 }} />
          <Tap
            accessibilityLabel={fmt(t("compare.navigate"), { store: label })}
            onPress={() => openWaze(store.lat, store.lng)}
            style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.waze, alignItems: "center", justifyContent: "center" }}
          >
            <Navigation size={22} color={colors.onWaze} />
          </Tap>
        </View>
        {!store.orderUrl && (
          <Text variant="caption" color="textTertiary">
            {t("compare.noShop")}
          </Text>
        )}
        {copied && (
          <Animated.View entering={FadeIn.duration(motion.duration.fast)} exiting={FadeOut.duration(motion.duration.fast)}>
            <Text variant="footnote" color="primary" accessibilityLiveRegion="polite">
              {t("compare.copied")}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** Thin coverage bar; the fill grows once on mount. Absolute and childless, so animating width costs no sibling layout. */
function Coverage({ ratio }: { ratio: number }) {
  const { colors, radius, motion } = useTheme();
  const reduced = useReducedMotion();
  const width = useSharedValue(0);
  const [track, setTrack] = useState(0);
  useEffect(() => {
    if (!track) return;
    width.set(reduced ? track * ratio : withTiming(track * ratio, { duration: motion.duration.slow, easing: EASE_OUT }));
  }, [track, ratio, reduced, width, motion.duration.slow]);
  const fill = useAnimatedStyle(() => ({ width: width.get() }));
  return (
    <View onLayout={(e) => setTrack(e.nativeEvent.layout.width)} style={{ height: 4, borderRadius: radius.full, backgroundColor: colors.surfaceSunken, overflow: "hidden" }}>
      <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, start: 0, borderRadius: radius.full, backgroundColor: ratio < 1 ? colors.warning : colors.primary }, fill]} />
    </View>
  );
}
