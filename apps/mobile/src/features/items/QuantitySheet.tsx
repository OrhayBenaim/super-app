import { QUANTITY, stepQuantity } from "@grocer/shared/quantity";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Minus, Plus } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useBestStore } from "@/features/compare/useBestStore";
import { fmt, shekels } from "@/features/compare/format";
import { lineKey } from "@/features/compare/sort";
import { matchKey, useCurrentListId, useItemMutations, useList } from "@/features/lists/api";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, IconButton, Sheet, SheetHeader, Text } from "@/ui";
import { formatQuantity, priceLabel, type ListScreen } from "./labels";

/** Sheet route app/quantity/[id]: a − / + stepper for an item's Quantity, with its price at the cheapest store. */
export function QuantitySheet() {
  const { id, from = "list" } = useLocalSearchParams<{ id: string; from?: ListScreen }>();
  const router = useRouter();
  const { space, colors, radius } = useTheme();
  const listId = useCurrentListId();
  const list = useList(listId, { poll: false }).data;
  const item = list?.items.find((i) => i.id === id) ?? null;
  const { update } = useItemMutations(listId);
  const [quantity, setQuantity] = useState(item?.quantity ?? QUANTITY.start);
  const best = useBestStore(list);

  if (!item) return null;
  const { soldBy } = item;
  const close = () => router.back();
  const save = () => {
    if (quantity !== item.quantity) {
      update.mutate({ id: item.id, quantity });
      track(Events.itemQuantityChanged, { soldBy, quantity, screen: from });
    }
    close();
  };
  const label = formatQuantity(quantity, soldBy, t);
  const line = best?.items.find((l) => lineKey(l) === matchKey(item));
  const footer = best && line ? fmt(t("quantity.footer"), { price: priceLabel(line.price, soldBy, t), store: best.chainName, estimate: shekels(line.price * quantity) }) : undefined;
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
        {/* − left, + right in both directions (DESIGN.md "Stepper"). */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], padding: space[4], direction: "ltr" }}>
          <IconButton
            icon={Minus}
            accessibilityLabel={`${t("quantity.less")}, ${label}`}
            analyticsName={Taps.quantityLess}
            disabled={min}
            onPress={() => step(-1)}
            style={{ borderRadius: radius.full, backgroundColor: colors.tintSoft }}
          />
          <View style={{ flex: 1, alignItems: "center", gap: space[1] }} accessible accessibilityLiveRegion="polite" accessibilityLabel={label}>
            <Text variant="title2" tabular>
              {label}
            </Text>
            {soldBy === "weight" && (
              <Text variant="footnote" color="labelSecondary">
                {fmt(t("quantity.step"), { n: QUANTITY.step.weight })}
              </Text>
            )}
          </View>
          <IconButton
            icon={Plus}
            accessibilityLabel={`${t("quantity.more")}, ${label}`}
            analyticsName={Taps.quantityMore}
            disabled={max}
            onPress={() => step(1)}
            style={{ borderRadius: radius.full, backgroundColor: colors.tintSoft }}
          />
        </View>
      </Group>
    </Sheet>
  );
}
