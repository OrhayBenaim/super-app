import type { ProductType } from "@grocer/shared/product-types";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { fromPrice } from "@/features/items/labels";
import { ProductImage } from "@/features/items/ProductImage";
import { useCardImage } from "@/features/items/products";
import type { Item } from "@/features/lists/api";
import { Taps, type TapName } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import type { Card } from "./api";
import { groupTarget } from "./card";
import { CardControls } from "./CardControls";
import { useCard } from "./useCard";

/**
 * A card's image, name and prices: a button that opens its product page, or one accessible element for a lone Product
 * with no group ref (`open` null), which has no product page.
 */
export function CardBody({ open, label, hint, analyticsName, children }: { open: (() => void) | null; label: string; hint: string; analyticsName: TapName; children: ReactNode }) {
  const { space } = useTheme();
  return open ? (
    <Tap accessibilityLabel={label} accessibilityHint={hint} analyticsName={analyticsName} onPress={open} style={{ gap: space[3] }}>
      {children}
    </Tap>
  ) : (
    <View accessible accessibilityLabel={label} style={{ gap: space[3] }}>
      {children}
    </View>
  );
}

/**
 * A Home group card (DESIGN.md "Card grid"): the commonest Product's image (else another Product's), the name and "from ₪X"
 * on top, the stepper and the action pinned to the bottom so a row lines up. The image, name and price are one button
 * that opens the group's product page, apart from the stepper and the action.
 */
export function GroupCard({ card, type, listId, items }: { card: Card; type: ProductType; listId: string | null; items: Item[] }) {
  const { colors, space, radius } = useTheme();
  const target = groupTarget(card, type);
  const { view, step, act } = useCard(target, listId, items, "home");
  const image = useCardImage(card);
  const price = card.minPrice === null ? null : fromPrice(card.measure, card.minPrice, t);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.group, padding: space[4] }}>
      <CardBody
        open={card.ref === null ? null : () => router.push({ pathname: "/group/[ref]", params: { ref: card.ref!, type } })}
        label={[target.name, price].filter(Boolean).join(", ")}
        hint={t("home.open.hint")}
        analyticsName={Taps.homeOpen}
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
      </CardBody>
      <View style={{ flex: 1, minHeight: space[4] }} />
      <CardControls name={target.name} view={view} onStep={step} onAct={act} />
    </View>
  );
}
