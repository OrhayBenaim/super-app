import type { ProductType } from "@grocer/shared/product-types";
import { router } from "expo-router";
import { View } from "react-native";
import { fromPrice, groupTitle } from "@/features/items/labels";
import { ProductImage } from "@/features/items/ProductImage";
import { useProductImage } from "@/features/items/products";
import type { Item } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import type { Card } from "./api";
import { typeNameKey, type CardTarget } from "./card";
import { CardControls } from "./CardControls";
import { useCard } from "./useCard";

/** What Add puts on the List for a group card: the group, named as search names it, in its Product type's category. */
export const groupTarget = (card: Card, type: ProductType): CardTarget => ({
  name: groupTitle(card, t),
  category: t(typeNameKey(type)),
  soldBy: card.soldBy,
  groupRef: card.ref,
  codes: card.codes,
});

/**
 * A Home group card (DESIGN.md "Card grid"): the commonest Product's image (none when it has none), the name and "from ₪X"
 * on top, the stepper and the action pinned to the bottom so a row lines up. The image, name and price are one button
 * that opens the group's product page, apart from the stepper and the action.
 */
export function GroupCard({ card, type, listId, items }: { card: Card; type: ProductType; listId: string | null; items: Item[] }) {
  const { colors, space, radius } = useTheme();
  const target = groupTarget(card, type);
  const { view, step, act } = useCard(target, listId, items, "home");
  const image = useProductImage(card.code);
  const price = card.minPrice === null ? null : fromPrice(card.measure, card.minPrice, t);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.group, padding: space[4] }}>
      <Tap
        accessibilityLabel={[target.name, price].filter(Boolean).join(", ")}
        accessibilityHint={t("home.open.hint")}
        analyticsName={Taps.homeOpen}
        onPress={() => router.push({ pathname: "/group/[ref]", params: { ref: card.ref, type } })}
        style={{ gap: space[3] }}
      >
        <ProductImage url={image} style={{ width: "100%", height: 96 }} />
        <View style={{ gap: space[1] }}>
          <Text variant="headline" numberOfLines={2}>
            {target.name}
          </Text>
          {price && (
            <Text variant="priceRow" numberOfLines={1}>
              {price}
            </Text>
          )}
        </View>
      </Tap>
      <View style={{ flex: 1, minHeight: space[4] }} />
      <CardControls name={target.name} view={view} onStep={step} onAct={act} />
    </View>
  );
}
