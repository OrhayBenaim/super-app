import { useLocalSearchParams, useRouter } from "expo-router";
import { Info, Tag } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { lineDetail } from "@/features/items/labels";
import { missingItems, useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme, type ColorName } from "@/theme";
import { Button, Group, Row, Sheet, SheetHeader, Text } from "@/ui";
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

/**
 * Sheet route app/breakdown: the Basket breakdown of the branch open on Compare (param `storeId`). A line per priced item (quantity × Shelf
 * price, line total; on a Promotion its text and label, the lowered total and the struck Shelf total; then the Promotions
 * its Quantity doesn't reach and the information-only ones), a row per spend deal ("−₪x" in `saving`), the total, then
 * the items it doesn't price and the unmatched ones (with Match).
 */
export function BreakdownSheet() {
  const router = useRouter();
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const list = useList(useCurrentListId(), { poll: false }).data;
  const store = useCompareStores(list).find((s) => s.storeId === storeId); // Compare's cached result
  if (!store) return null;
  const { priced, basket, notHere, unmatched } = breakdown(missingItems(list), store);
  const missing = notHere.length + unmatched.length;
  const price = (n: number, color: ColorName = "label", shown = shekels(n)) => (
    <Text variant="priceRow" tabular color={color}>
      {shown}
    </Text>
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
          <Row title={t("compare.breakdown.total")} detail={fmt(t("compare.breakdown.count"), { n: priced.length })} trailing={price(store.total)} />
        </Group>
        {missing > 0 && (
          <Group title={fmt(t("compare.missingCount"), { n: missing })}>
            {notHere.map((item) => (
              <Row key={item.id} title={item.name} detail={t("compare.missing.notHere")} />
            ))}
            {unmatched.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                detail={t("compare.missing.unmatched")}
                trailing={
                  <Button
                    variant="plain"
                    title={t("compare.missing.match")}
                    analyticsName={Taps.compareMissingMatch}
                    accessibilityLabel={`${t("compare.missing.match")}: ${item.name}`}
                    onPress={() => router.replace({ pathname: "/item/[id]", params: { id: item.id, page: "product" } })}
                    style={{ paddingHorizontal: 0 }}
                  />
                }
              />
            ))}
          </Group>
        )}
      </Sheet>
    </ScrollView>
  );
}
