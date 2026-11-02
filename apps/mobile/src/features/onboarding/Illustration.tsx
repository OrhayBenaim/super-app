import { Check, ShoppingBasket } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, type SharedValue } from "react-native-reanimated";
import { fmt, formatDistance, shekels } from "@/features/compare/format";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Group, Text } from "@/ui";

type Props = { scrollX: SharedValue<number>; width: number; height: number; pages: number; rtl: boolean };

/** Onboarding stage: one real UI fragment per page (list, best store, nearby alert), never drawn art. Decorative, hidden from assistive tech. */
export function Illustration({ scrollX, width, height, pages, rtl }: Props) {
  const reduced = useReducedMotion();
  const fragments = [ListFragment, BestStoreFragment, AlertFragment];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, start: 0, end: 0, height, overflow: "hidden", direction: "ltr" }}
    >
      {fragments.map((Fragment, i) => (
        <Page key={i} physical={rtl ? pages - 1 - i : i} {...{ scrollX, width, height, reduced, rtl }}>
          <Fragment />
        </Page>
      ))}
    </View>
  );
}

function Page({ physical, scrollX, width, height, reduced, rtl, children }: { physical: number; scrollX: SharedValue<number>; width: number; height: number; reduced: boolean; rtl: boolean; children: ReactNode }) {
  const { space } = useTheme();
  const style = useAnimatedStyle(() => {
    const at = physical * width;
    const x = scrollX.get();
    return {
      opacity: interpolate(x, [at - width, at, at + width], [0, 1, 0], Extrapolation.CLAMP),
      // Fragment travels at half page speed, so it lags the copy. Reduced motion keeps only the crossfade.
      transform: [{ translateX: reduced ? 0 : (at - x) * 0.5 }],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", top: 0, start: 0, width, height, justifyContent: "center", paddingHorizontal: space[7], direction: rtl ? "rtl" : "ltr" }, style]}>
      {children}
    </Animated.View>
  );
}

function ListFragment() {
  const { colors, space, size } = useTheme();
  const rows = [t("onboarding.sample.item1"), t("onboarding.sample.item2"), t("onboarding.sample.item3")];
  return (
    <Group inset={space[5] + 24 + space[4]}>
      {rows.map((name, i) => {
        const done = i === 1;
        return (
          <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row - 8, paddingHorizontal: space[5] }}>
            <View
              style={{ width: 24, height: 24, borderRadius: 12, borderWidth: done ? 0 : 1.5, borderColor: colors.controlOutline, backgroundColor: done ? colors.tint : "transparent", alignItems: "center", justifyContent: "center" }}
            >
              {done && <Check size={15} color={colors.tintOn} strokeWidth={3} />}
            </View>
            <Text variant="callout" color={done ? "labelSecondary" : "label"} style={{ textDecorationLine: done ? "line-through" : "none" }}>
              {name}
            </Text>
          </View>
        );
      })}
    </Group>
  );
}

function BestStoreFragment() {
  const { space } = useTheme();
  return (
    <Group>
      <View style={{ padding: space[5], gap: space[3] }}>
        <View style={{ flexDirection: "row", gap: space[3] }}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text variant="headline">{t("onboarding.sample.chain")}</Text>
            <Text variant="footnote" color="labelSecondary">
              {t("onboarding.sample.branch")} · {formatDistance(1.2, t)}
            </Text>
            <Text variant="footnote" color="saving" style={{ fontWeight: "600" }}>
              {fmt(t("compare.saving"), { amount: shekels(1.2), chain: t("onboarding.sample.other") })}
            </Text>
          </View>
          <Text variant="priceHero" style={{ fontSize: 32, lineHeight: 38 }}>
            {shekels(21.7)}
          </Text>
        </View>
        <Text variant="footnote" color="warning">
          {fmt(t("compare.coverage.partial"), { n: 3, m: 4, missing: 1 })}
        </Text>
        <Button title={t("compare.navigate")} analyticsName="onboarding.demo.navigate" style={{ minHeight: 42 }} />
        <Button title={t("compare.order")} analyticsName="onboarding.demo.order" variant="plain" style={{ minHeight: 36 }} />
      </View>
    </Group>
  );
}

function AlertFragment() {
  const { colors, space, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space[4], padding: space[4], borderRadius: radius.sheet, backgroundColor: colors.surface }}>
      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" }}>
        <ShoppingBasket size={18} color={colors.tintOn} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="subhead" style={{ fontWeight: "600" }}>
          {fmt(t("nearby.title"), { store: t("onboarding.sample.chain") })}
        </Text>
        <Text variant="footnote">{fmt(t("nearby.body"), { total: "21.70" })}</Text>
      </View>
    </View>
  );
}
