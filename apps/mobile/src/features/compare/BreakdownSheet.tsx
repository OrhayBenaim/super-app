import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { lineDetail } from "@/features/items/labels";
import { missingItems, useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { Button, Group, Row, Sheet, SheetHeader, Text } from "@/ui";
import { useCompareStores } from "./useBestStore";
import { breakdown } from "./breakdown";
import { fmt, shekels } from "./format";

/**
 * Sheet route app/breakdown: the Basket breakdown of the branch open on Compare (param `storeId`). A line per priced item (quantity × price, line
 * total), the total, then the items it doesn't price and the unmatched ones (with Match).
 */
export function BreakdownSheet() {
  const router = useRouter();
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const list = useList(useCurrentListId(), { poll: false }).data;
  const store = useCompareStores(list).find((s) => s.storeId === storeId); // Compare's cached result
  if (!store) return null;
  const { priced, notHere, unmatched } = breakdown(missingItems(list), store);
  const missing = notHere.length + unmatched.length;
  const price = (n: number) => (
    <Text variant="priceRow" tabular>
      {shekels(n)}
    </Text>
  );
  return (
    <ScrollView>
      <Sheet>
        <SheetHeader title={fmt(t("compare.breakdown.title"), { store: store.chainName })} end={{ title: t("common.done"), analyticsName: Taps.commonDone, onPress: () => router.back() }} />
        <Group footer={t("compare.breakdown.footer")}>
          {priced.map(({ item, price: each, lineTotal }) => (
            <Row key={item.id} title={item.name} detail={lineDetail(item.quantity, each, item.soldBy, t)} trailing={price(lineTotal)} />
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
