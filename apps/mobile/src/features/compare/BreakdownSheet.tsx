import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { lineDetail } from "@/features/items/quantity";
import { missingItems, useCurrentListId, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { Button, Group, Row, Sheet, SheetHeader, Text } from "@/ui";
import { breakdown } from "./breakdown";
import { fmt, shekels } from "./format";
import type { StoreResult } from "./sort";

/** The slice of the best store the sheet shows; Compare passes it as the JSON `store` param. */
export type BreakdownStore = Pick<StoreResult, "chainName" | "total" | "items">;

/**
 * Sheet route app/breakdown: the Basket breakdown of the best branch. A line per priced item (quantity × price, line
 * total), the total, then the items it doesn't price and the unmatched ones (with Match).
 */
export function BreakdownSheet() {
  const params = useLocalSearchParams<{ store: string }>();
  const router = useRouter();
  const store = JSON.parse(params.store) as BreakdownStore;
  const { priced, notHere, unmatched } = breakdown(missingItems(useList(useCurrentListId(), { poll: false }).data), store);
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
