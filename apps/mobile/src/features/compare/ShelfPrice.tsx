import { t } from "@/lib/strings";
import { Text } from "@/ui";
import { fmt, shekels } from "./format";

/** The struck Shelf price under or beside a Promotion price: Secondary Label, read as "במקום ₪X". */
export const ShelfPrice = ({ price, variant }: { price: number; variant: "footnote" | "subhead" }) => (
  <Text variant={variant} color="labelSecondary" tabular style={{ textDecorationLine: "line-through" }} accessibilityLabel={fmt(t("compare.promo.insteadOf"), { price: shekels(price) })}>
    {shekels(price)}
  </Text>
);
