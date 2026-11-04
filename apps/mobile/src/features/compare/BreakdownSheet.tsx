import { useLocalSearchParams, useRouter } from "expo-router";
import { Info, Tag } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { lineDetail } from "@/features/items/labels";
import { missingItems, useCurrentListId, useList, type Item } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme, type ColorName } from "@/theme";
import { Group, Row, Sheet, SheetHeader, Text } from "@/ui";
import { useCompareStores } from "./useBestStore";
import { breakdown } from "./breakdown";
import { fmt, shekels } from "./format";
import { basketText, promotionRows } from "./promotion";

/**
 * A Promotion under a breakdown line: a decorative icon on the start side, then its text (wraps). The applied one is in `saving`
 * (Tag, footnoteEmphasized text, then its label in regular labelSecondary); one not reached (Tag) and an information-only one (Info) are labelSecondary.
 */
function PromotionRow({ kind, text, label }: ReturnType<typeof promotionRows>[number]) {
  const { colors, space, font } = useTheme();
  const applied = kind === "applied";
  const Icon = kind === "info" ? Info : Tag;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
      {/* As tall as the text's first line, so the icon centres on it. */}
      <View style={{ minHeight: font.lineHeight.footnote, justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no">
        <Icon size={16} strokeWidth={1.75} color={applied ? colors.saving : colors.labelSecondary} />
      </View>
      <Text variant={applied ? "footnoteEmphasized" : "footnote"} color={applied ? "saving" : "labelSecondary"} style={{ flex: 1 }}>
        {text}
        {label && (
          <Text variant="footnote" color="labelSecondary">
            {` · ${label}`}
          </Text>
        )}
      </Text>
    </View>
  );
}

/** True once `on` has stayed on for `ms`, so a fast refetch never flashes a spinner. */
function useDelayed(on: boolean, ms: number) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    if (!on) return;
    const id = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on && late;
}

/**
 * Sheet route app/breakdown: the Basket breakdown of the branch open on Compare (param `storeId`). A line per priced item (quantity × Shelf
 * price, line total; on a Promotion its text and label, the lowered total and the struck Shelf total; then the Promotions
 * its Quantity doesn't reach and the information-only ones), a row per spend deal ("−₪x" in `saving`), the total, then
 * its Missing items (tap one to re-match it in the item sheet, stacked on this one).
 */
export function BreakdownSheet() {
  const router = useRouter();
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const list = useList(useCurrentListId(), { poll: false }).data;
  const { colors } = useTheme();
  const { stores, updating } = useCompareStores(list); // Compare's cached result
  const spinning = useDelayed(updating, 250);
  const store = stores.find((s) => s.storeId === storeId);
  if (!store) return null;
  const { priced, basket, notHere, unmatched } = breakdown(missingItems(list), store);
  const missing = notHere.length + unmatched.length;
  const price = (n: number, color: ColorName = "label", shown = shekels(n)) => (
    <Text variant="priceRow" tabular color={color}>
      {shown}
    </Text>
  );
  const missingRow = (item: Item, detail: string) => (
    <Row
      key={item.id}
      title={item.name}
      detail={detail}
      chevron
      analyticsName={Taps.compareMissingMatch}
      accessibilityLabel={`${t("compare.missing.match")}: ${item.name}`}
      // Pushed, so the match sheet stacks on this breakdown and closing it returns here.
      onPress={() => router.push({ pathname: "/item/[id]", params: { id: item.id, page: "product", storeId } })}
    />
  );
  return (
    <ScrollView>
      <Sheet>
        <SheetHeader title={fmt(t("compare.breakdown.title"), { store: store.chainName })} end={{ title: t("common.done"), analyticsName: Taps.commonDone, onPress: () => router.back() }} />
        <Group footer={priced.some((p) => p.info?.length) ? `${t("compare.breakdown.footer")} ${t("compare.breakdown.infoFooter")}` : t("compare.breakdown.footer")}>
          {priced.map(({ item, price: each, lineTotal, shelfTotal, promotion, ...rest }) => (
            <Row
              key={item.id}
              title={item.name}
              detail={lineDetail(item.quantity, each, item.soldBy, t)}
              below={promotionRows({ promotion, ...rest }, item.soldBy, t).map((row, i) => (
                <PromotionRow key={i} {...row} />
              ))}
              trailing={
                promotion && lineTotal < shelfTotal ? (
                  <View style={{ alignItems: "flex-end" }}>
                    {price(lineTotal, "saving")}
                    <Text
                      variant="footnote"
                      color="labelSecondary"
                      tabular
                      style={{ textDecorationLine: "line-through" }}
                      accessibilityLabel={fmt(t("compare.promo.insteadOf"), { price: shekels(shelfTotal) })}
                    >
                      {shekels(shelfTotal)}
                    </Text>
                  </View>
                ) : (
                  price(lineTotal)
                )
              }
            />
          ))}
          {basket.map(({ deal, items }) => (
            <Row
              key={deal.id}
              title={basketText(deal, items[0]?.soldBy ?? "unit", t)}
              detail={items.map((i) => i.name).join(", ")}
              // An LTR isolate keeps the minus before the amount in Hebrew.
              trailing={price(deal.saving, "saving", `\u2066−${shekels(deal.saving)}\u2069`)}
            />
          ))}
          <Row title={t("compare.breakdown.total")} detail={fmt(t("compare.breakdown.count"), { n: priced.length })} trailing={spinning ? <ActivityIndicator color={colors.labelSecondary} /> : price(store.total)} />
        </Group>
        {missing > 0 && (
          <Group title={fmt(t("compare.missingCount"), { n: missing })}>
            {notHere.map((item) => missingRow(item, t("compare.missing.notHere")))}
            {unmatched.map((item) => missingRow(item, t("compare.missing.unmatched")))}
          </Group>
        )}
      </Sheet>
    </ScrollView>
  );
}
