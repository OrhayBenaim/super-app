import { useLocalSearchParams, useRouter } from "expo-router";
import { Tag } from "lucide-react-native";
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
import { promotionText } from "./promotion";

/** A Promotion under a breakdown line: a decorative Tag on the start side, then its text (wraps). */
function PromotionRow({ text }: { text: string }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
      <View style={{ width: 16, height: 18, justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no">
        <Tag size={16} color={colors.saving} />
      </View>
      <Text variant="footnote" color="saving" style={{ flex: 1, fontWeight: "600" }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Sheet route app/breakdown: the Basket breakdown of the branch open on Compare (param `storeId`). A line per priced item (quantity × Shelf
 * price, line total; on a Promotion its text, the lowered total and the struck Shelf total), the total, then the items it doesn't price and the
 * unmatched ones (with Match).
 */
export function BreakdownSheet() {
  const router = useRouter();
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const list = useList(useCurrentListId(), { poll: false }).data;
  const store = useCompareStores(list).find((s) => s.storeId === storeId); // Compare's cached result
  if (!store) return null;
  const { priced, notHere, unmatched } = breakdown(missingItems(list), store);
  const missing = notHere.length + unmatched.length;
  const price = (n: number, color: ColorName = "label") => (
    <Text variant="priceRow" tabular color={color}>
      {shekels(n)}
    </Text>
  );
  return (
    <ScrollView>
      <Sheet>
        <SheetHeader title={fmt(t("compare.breakdown.title"), { store: store.chainName })} end={{ title: t("common.done"), analyticsName: Taps.commonDone, onPress: () => router.back() }} />
        <Group footer={t("compare.breakdown.footer")}>
          {priced.map(({ item, price: each, lineTotal, shelfTotal, promotion }) => (
            <Row
              key={item.id}
              title={item.name}
              detail={lineDetail(item.quantity, each, item.soldBy, t)}
              below={promotion && <PromotionRow text={promotionText(promotion, item.soldBy, t)} />}
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
