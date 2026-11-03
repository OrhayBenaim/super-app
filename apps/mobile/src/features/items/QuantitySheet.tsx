import { QUANTITY, stepQuantity } from "@grocer/shared/quantity";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Minus, Plus } from "lucide-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useCompare, useRadius } from "@/features/compare/api";
import { fmt, shekels } from "@/features/compare/format";
import { sortStores } from "@/features/compare/sort";
import { matchKey, missingBasket, useCurrentListId, useItemMutations, useList } from "@/features/lists/api";
import { Events, Taps, track } from "@/lib/analytics";
import { useLocation } from "@/lib/location";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, IconButton, Sheet, SheetHeader, Text } from "@/ui";
import { formatQuantity, priceLabel } from "./quantity";

/** Sheet route app/quantity/[id]: a − / + stepper for an item's Quantity, with its price at the cheapest store. */
export function QuantitySheet() {
  const { id, from = "list" } = useLocalSearchParams<{ id: string; from?: "list" | "items" }>();
  const router = useRouter();
  const { space, colors, radius } = useTheme();
  const listId = useCurrentListId();
  const list = useList(listId, { poll: false }).data;
  const item = list?.items.find((i) => i.id === id) ?? null;
  const { update } = useItemMutations(listId);
  const [quantity, setQuantity] = useState(item?.quantity ?? QUANTITY.start);
  // Same query key as Compare and the "cheapest now" row, so this reads their cached result.
  const compare = useCompare(useLocation().coords, useRadius((s) => s.km), missingBasket(list));

  if (!item) return null;
  const { soldBy } = item;
  const close = () => router.back();
  const save = () => {
    if (quantity !== item.quantity) {
      update.mutate({ id: item.id, quantity }, { onError: () => Alert.alert(t("common.error")) });
      track(Events.itemQuantityChanged, { soldBy, quantity, screen: from });
    }
    close();
  };
  const amount = formatQuantity(quantity, soldBy, t);
  const best = sortStores(compare.data?.stores ?? [], "price")[0];
  const line = best?.items.find((l) => ("ref" in l ? l.ref : l.code) === matchKey(item));
  const footer =
    best && line
      ? fmt(t("quantity.footer"), { price: priceLabel(line.price, soldBy, t), store: best.chainName, estimate: shekels(Math.round(line.price * quantity * 100) / 100) })
      : undefined;
  const step = (dir: 1 | -1) => setQuantity((q) => stepQuantity(q, soldBy, dir));
  const min = quantity <= QUANTITY.step[soldBy];
  const max = quantity >= QUANTITY.max;

  return (
    <Sheet>
      <SheetHeader
        title={item.name}
        start={{ title: t("common.cancel"), analyticsName: Taps.quantityCancel, onPress: close }}
        end={{ title: t("common.save"), analyticsName: Taps.quantitySave, onPress: save }}
      />
      <Group footer={footer}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], padding: space[4] }}>
          <IconButton
            icon={Minus}
            accessibilityLabel={`${t("quantity.less")}, ${amount}`}
            analyticsName={Taps.quantityLess}
            disabled={min}
            onPress={() => step(-1)}
            style={{ borderRadius: radius.full, backgroundColor: colors.tintSoft, opacity: min ? 0.4 : 1 }}
          />
          <View style={{ flex: 1, alignItems: "center", gap: space[1] }} accessible accessibilityLiveRegion="polite" accessibilityLabel={amount}>
            <Text variant="title2" tabular>
              {amount}
            </Text>
            {soldBy === "weight" && (
              <Text variant="footnote" color="labelSecondary">
                {t("quantity.step")}
              </Text>
            )}
          </View>
          <IconButton
            icon={Plus}
            accessibilityLabel={`${t("quantity.more")}, ${amount}`}
            analyticsName={Taps.quantityMore}
            disabled={max}
            onPress={() => step(1)}
            style={{ borderRadius: radius.full, backgroundColor: colors.tintSoft, opacity: max ? 0.4 : 1 }}
          />
        </View>
      </Group>
    </Sheet>
  );
}
