import { View } from "react-native";
import { CardControls } from "@/features/home/CardControls";
import { groupTarget } from "@/features/home/GroupCard";
import { useCard } from "@/features/home/useCard";
import { ProductImage } from "@/features/items/ProductImage";
import { useProductImage } from "@/features/items/products";
import type { Item } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Text } from "@/ui";
import { promoLines, type PromoCard as Card } from "./promo";

/**
 * A Promotions card (Figma PromoCard): Home's group card with the lowest Promotion price in Saving green next to the
 * struck Shelf price (or the reward's text when there is no price), the Restricted label and "at N Chains". Add matches
 * the whole group, as on Home. The image, name and prices are one element.
 */
export function PromoCard({ card, listId, items }: { card: Card; listId: string | null; items: Item[] }) {
  const { colors, space, radius } = useTheme();
  const target = groupTarget(card, card.type);
  const { view, step, act } = useCard(target, listId, items, "promotions");
  const image = useProductImage(card.code);
  const lines = promoLines(card, t);
  const label = [target.name, lines.price, lines.shelfLabel, lines.deal, lines.restricted, lines.chains].filter(Boolean).join(", ");
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.group, padding: space[4] }}>
      <View accessible accessibilityLabel={label} style={{ gap: space[3] }}>
        <ProductImage url={image} style={{ width: "100%", height: 96 }} />
        <View style={{ gap: space[1] }}>
          <Text variant="headline" numberOfLines={2}>
            {target.name}
          </Text>
          {lines.price ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2] }}>
              <Text variant="priceRow" color="saving" numberOfLines={1} style={{ flexShrink: 1 }}>
                {lines.price}
              </Text>
              <Text variant="subhead" color="labelSecondary" tabular style={{ textDecorationLine: "line-through" }}>
                {lines.shelf}
              </Text>
            </View>
          ) : (
            <Text variant="priceRow" color="saving" numberOfLines={2}>
              {lines.deal}
            </Text>
          )}
          {lines.price && lines.deal && (
            <Text variant="footnote" color="labelSecondary" numberOfLines={1}>
              {lines.deal}
            </Text>
          )}
          {lines.restricted && (
            <Text variant="footnote" color="labelSecondary" numberOfLines={1}>
              {lines.restricted}
            </Text>
          )}
          <Text variant="footnote" color="labelSecondary" numberOfLines={1}>
            {lines.chains}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1, minHeight: space[4] }} />
      <CardControls name={target.name} view={view} onStep={step} onAct={act} />
    </View>
  );
}
