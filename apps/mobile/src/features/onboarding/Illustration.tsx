import { Image } from "expo-image";
import { Plus, ShoppingBasket } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, type SharedValue } from "react-native-reanimated";
import { BestStore } from "@/features/compare/BestStore";
import { fmt, shekels } from "@/features/compare/format";
import { AddBadge, ItemRow } from "@/features/items/ItemRow";
import { Avatar } from "@/features/lists/Avatars";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Group, Row, SearchField, Text } from "@/ui";

type Props = { scrollX: SharedValue<number>; width: number; height: number; pages: number; rtl: boolean };
type FragmentProps = { stage: number; screen: number; rtl: boolean };

const art = {
  wave: require("../../../assets/onboarding/mascot-wave.svg"),
  point: require("../../../assets/onboarding/mascot-point.svg"),
  price: require("../../../assets/onboarding/mascot-price.svg"),
  road: require("../../../assets/onboarding/road.svg"),
  carBody: require("../../../assets/onboarding/car/body.svg"),
  driver: require("../../../assets/onboarding/car/driver.svg"),
  carSide: require("../../../assets/onboarding/car/side.svg"),
  carSill: require("../../../assets/onboarding/car/sill.svg"),
  tyre: require("../../../assets/onboarding/car/tyre.svg"),
  hub: require("../../../assets/onboarding/car/hub.svg"),
  light: require("../../../assets/onboarding/car/light.svg"),
};

/**
 * Onboarding stage: a tint-soft card whose content follows the pager, one page per slide (the mascot, then clones of
 * the real add field, share sheet, best store and nearby alert). Decorative, hidden from assistive tech.
 */
export function Illustration({ scrollX, width, height, pages, rtl }: Props) {
  const { colors, space } = useTheme();
  const reduced = useReducedMotion();
  const stage = width - space[5] * 2;
  const fragments = [Hello, AddItem, ShareList, Cheapest, GoNearby];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, start: space[5], end: space[5], height, borderRadius: 24, backgroundColor: colors.tintSoft, overflow: "hidden", direction: "ltr" }}
    >
      {fragments.slice(0, pages).map((Fragment, i) => (
        <Page key={i} physical={rtl ? pages - 1 - i : i} {...{ scrollX, width, stage, reduced, rtl }}>
          <Fragment stage={stage} screen={width} rtl={rtl} />
        </Page>
      ))}
    </View>
  );
}

function Page({ physical, scrollX, width, stage, reduced, rtl, children }: { physical: number; scrollX: SharedValue<number>; width: number; stage: number; reduced: boolean; rtl: boolean; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const at = physical * width;
    const x = scrollX.get();
    return {
      opacity: interpolate(x, [at - width, at, at + width], [0, 1, 0], Extrapolation.CLAMP),
      // Content travels at half page speed, so it lags the copy. Reduced motion keeps only the crossfade.
      transform: [{ translateX: reduced ? 0 : (at - x) * 0.5 }],
    };
  });
  return <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, start: 0, width: stage, direction: rtl ? "rtl" : "ltr" }, style]}>{children}</Animated.View>;
}

/** Shrinks a full-size clone of a real screen part to `width`, anchored at its top. */
function Scaled({ width, scale, children }: { width: number; scale: number; children: ReactNode }) {
  const inner = width / scale;
  return (
    <View style={{ width }}>
      <View style={{ width: inner, marginHorizontal: (width - inner) / 2, transform: [{ scale }], transformOrigin: "50% 0%" }}>{children}</View>
    </View>
  );
}

/** The 104pt mascot holding a price tag, at the bottom end of the stage. ₪ is a glyph, never drawn art. */
function PriceMascot() {
  const { colors } = useTheme();
  return (
    <View style={{ position: "absolute", end: 8, bottom: 4, width: 104, height: 104, direction: "ltr" }}>
      <Image source={art.price} style={{ width: 104, height: 104 }} contentFit="fill" />
      <Text variant="caption" style={{ position: "absolute", left: 14.5, top: 75.8, width: 11, fontSize: 8, lineHeight: 14, fontWeight: "700", color: colors.tintOn, textAlign: "center", transform: [{ rotate: "-18deg" }] }}>
        ₪
      </Text>
    </View>
  );
}

function Hello() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Image source={art.wave} style={{ width: 220, height: 220 }} contentFit="fill" />
    </View>
  );
}

const sampleItem = (name: string, missing: boolean) => ({ id: name, listId: "", name, category: "", productCode: null, missing, createdAt: "", updatedAt: "" });
const noop = () => {};

/** Clone of the + add field with a typed query, as the list screen shows it. */
function AddItem({ stage, screen, rtl }: FragmentProps) {
  const { colors, space } = useTheme();
  const query = t("onboarding.sample.query");
  return (
    <View style={{ flex: 1, alignItems: "flex-start", paddingTop: space[7] }}>
      <Scaled width={stage * 0.87} scale={(stage * 0.87) / screen}>
        <View style={{ paddingHorizontal: space[5], paddingVertical: space[3] }}>
          <SearchField label={t("items.add.placeholder")} icon={Plus} value={query} editable={false} />
        </View>
        <View style={{ paddingHorizontal: space[5], paddingTop: space[3] }}>
          <Group>
            <ItemRow item={sampleItem(t("onboarding.sample.item1"), true)} onToggle={noop} />
            <Row
              title={t("onboarding.sample.item2")}
              detail={[fmt(t("items.product.from"), { price: shekels(10.9) }), fmt(t("items.product.stores"), { n: 11 })].join(" · ")}
              trailing={<AddBadge />}
            />
            <Row title={fmt(t("items.add.create"), { name: query })} titleColor="tint" trailing={<Plus size={20} color={colors.tint} strokeWidth={2} />} />
          </Group>
        </View>
      </Scaled>
      {/* The mascot points at the field: drawn for RTL, mirrored in LTR. */}
      <Image source={art.point} style={{ position: "absolute", end: -4, top: 6, width: 104, height: 104, transform: [{ scaleX: rtl ? 1 : -1 }] }} contentFit="fill" />
    </View>
  );
}

/** Clone of the share sheet: members and the invite code. */
function ShareList({ stage }: FragmentProps) {
  const { space } = useTheme();
  const owner = t("onboarding.sample.owner");
  const member = t("onboarding.sample.member");
  return (
    <View style={{ flex: 1, alignItems: "center", paddingTop: space[6] }}>
      <Scaled width={stage * 0.78} scale={0.78}>
        <Group inset={space[5] + 32 + space[4]}>
          <Row title={`${owner} (${t("share.you")})`} detail="noa@example.co.il" leading={<Avatar name={owner} />} value={t("share.owner")} />
          <Row title={member} detail="omer@example.co.il" leading={<Avatar name={member} />} />
        </Group>
        <Group style={{ marginTop: space[3] }}>
          <View style={{ alignItems: "center", gap: space[3], padding: space[5] }}>
            <View style={{ alignItems: "center" }}>
              <Text variant="footnote" color="labelSecondary">
                {t("share.code")}
              </Text>
              <Text variant="priceHero" style={{ letterSpacing: 4 }}>
                K7Q-29M
              </Text>
            </View>
            <Button title={t("share.send")} analyticsName={Taps.shareSend} style={{ alignSelf: "stretch" }} />
            <Button title={t("share.copy")} analyticsName={Taps.shareCopy} variant="plain" style={{ alignSelf: "stretch" }} />
          </View>
        </Group>
      </Scaled>
      <PriceMascot />
    </View>
  );
}

const sampleStore = {
  storeId: "", chainId: "", chainName: "", storeName: "", address: "", city: "",
  lat: 0, lng: 0, distanceKm: 1.2, total: 21.7, matched: 3, missingCodes: [], items: [], orderUrl: "https://example.com",
};

/** The real Compare hero with sample numbers. */
function Cheapest() {
  const { space } = useTheme();
  const store = { ...sampleStore, chainName: t("onboarding.sample.chain"), storeName: t("onboarding.sample.branch") };
  return (
    <View style={{ flex: 1, paddingTop: space[1] }}>
      <BestStore store={store} basketSize={4} saving={{ amount: 1.2, chainName: t("onboarding.sample.other") }} listText="" onShowMissing={noop} />
      <PriceMascot />
    </View>
  );
}

type Pct = `${number}%`;
/** A car layer placed by its physical insets in the car box: [top, right, bottom, left]. */
const carPart = (source: number, [top, right, bottom, left]: Pct[]) => <Image source={source} style={{ position: "absolute", top, right, bottom, left }} contentFit="fill" />;

/** The mascot driving along the panorama road, under the nearby alert it gets on the way. */
function GoNearby() {
  const { colors, space } = useTheme();
  return (
    <View style={{ flex: 1, paddingTop: 36 }}>
      <View style={{ position: "absolute", left: -110, top: -500, width: 1108.8, height: 1204.56, direction: "ltr" }}>
        <Image source={art.road} style={{ position: "absolute", left: -73.5, top: 0, width: 1260, height: 1204.56 }} contentFit="fill" />
        <View style={{ position: "absolute", left: 199.92, top: 675.97, width: 164.97, height: 154.85, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 154.56, height: 72.45, transform: [{ rotate: "-40deg" }] }}>
            {carPart(art.carBody, ["14.01%", "20.5%", "55.32%", "18.25%"])}
            <Image source={art.driver} style={{ position: "absolute", left: 13.59, top: -49.41, width: 123.53, height: 123.53 }} contentFit="fill" />
            {carPart(art.carSide, ["42.67%", "3.75%", "22.67%", "3.75%"])}
            {carPart(art.carSill, ["64%", "3.75%", "22.67%", "3.75%"])}
            {carPart(art.tyre, ["60%", "65%", "5.33%", "18.75%"])}
            {carPart(art.hub, ["70%", "69.69%", "15.33%", "23.44%"])}
            {carPart(art.tyre, ["60%", "17.5%", "5.33%", "66.25%"])}
            {carPart(art.hub, ["70%", "22.19%", "15.33%", "70.94%"])}
            {carPart(art.light, ["49.33%", "2.5%", "41.33%", "91.25%"])}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 20, backgroundColor: colors.surface }}>
        <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" }}>
          <ShoppingBasket size={22} color={colors.tintOn} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="headline">{fmt(t("nearby.title"), { store: t("onboarding.sample.chain") })}</Text>
          <Text variant="subhead">{fmt(t("nearby.body"), { total: "21.70" })}</Text>
        </View>
      </View>
    </View>
  );
}
