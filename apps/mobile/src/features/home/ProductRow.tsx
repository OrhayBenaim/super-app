import { View } from "react-native";
import { priceLabel, sizeLabel } from "@/features/items/labels";
import { ProductImage } from "@/features/items/ProductImage";
import { useProductImage } from "@/features/items/products";
import type { Item } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Text } from "@/ui";
import type { GroupProduct } from "./api";
import type { CardTarget } from "./card";
import { CardControls } from "./CardControls";
import { useCard, type CardScreen } from "./useCard";

/** "1 L", "by weight", or nothing when the pack size can't be read. */
/** The Product image on a product page row, in pt (Chain lines under it indent past it). */
export const ROW_IMAGE = 48;

export const packSize = (p: GroupProduct) =>
  p.soldBy === "weight" ? t("items.product.byWeight") : p.measure && p.size ? sizeLabel(p.measure, p.size, t) : null;

/**
 * One Product on its group's product page (Figma ProductRow): image, name, pack size and cheapest nearby price (when
 * known) on the first line, the stepper and the action across the full width below. The action can also be "switch to this".
 */
export function ProductRow({ product, group, listId, items, screen = "home" }: { product: GroupProduct; group: CardTarget; listId: string | null; items: Item[]; screen?: CardScreen }) {
  const { space } = useTheme();
  const target: CardTarget = { name: product.name, category: group.category, soldBy: product.soldBy, productCode: product.code };
  const { view, step, act } = useCard(target, listId, items, screen, group);
  const image = useProductImage(product.code);
  const size = packSize(product);
  const price = product.minPrice === null ? null : priceLabel(product.minPrice, product.soldBy, t);
  return (
    <View style={{ paddingHorizontal: space[5], paddingVertical: space[4], gap: space[4] }}>
      <View accessible accessibilityLabel={[product.name, size, price].filter(Boolean).join(", ")} style={{ flexDirection: "row", alignItems: "center", gap: space[4] }}>
        <ProductImage url={image} style={{ width: ROW_IMAGE, height: ROW_IMAGE }} />
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="body" numberOfLines={2}>
            {product.name}
          </Text>
          {size && (
            <Text variant="footnote" color="labelSecondary" numberOfLines={1}>
              {size}
            </Text>
          )}
        </View>
        {price && (
          <Text variant="priceRow" numberOfLines={1}>
            {price}
          </Text>
        )}
      </View>
      <CardControls name={product.name} view={view} onStep={step} onAct={act} row />
    </View>
  );
}
