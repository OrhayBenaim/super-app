import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { fmt } from "@/features/compare/format";
import type { TapName } from "@/lib/analytics";
import { t, type StringKey } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row, Text } from "@/ui";
import { GroupResult } from "./GroupResult";
import { productDetail } from "./labels";
import { ProductImage } from "./ProductImage";
import type { Product, ProductGroup } from "./products";

/** The "Searching products…" row. */
export function SearchingRow() {
  const { colors, space } = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={t("items.add.searching")} style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44, paddingHorizontal: space[5] }}>
      <ActivityIndicator color={colors.labelSecondary} />
      <Text color="labelSecondary">{t("items.add.searching")}</Text>
    </View>
  );
}

type Props = {
  groups: ProductGroup[];
  products: Product[];
  /** The accessibility label of a Product row (strings key, filled with {name}). */
  productLabel: StringKey;
  groupAnalyticsName?: TapName;
  productAnalyticsName: TapName;
  trailing?: ReactNode;
  onGroup: (group: ProductGroup) => void;
  onProduct: (product: Product) => void;
  onRefine: (word: string) => void;
};

/**
 * The List's and Home's product suggestions: Product groups on top, then up to three visible Product rows (the rest
 * scroll). Returns rows, not a component, so a parent `Group` draws one divider per row.
 */
export const suggestionRows = ({ groups, products, productLabel, groupAnalyticsName, productAnalyticsName, trailing, onGroup, onProduct, onRefine }: Props): ReactNode[] => [
  ...groups.map((g) => <GroupResult key={g.ref} group={g} analyticsName={groupAnalyticsName} trailing={trailing} onPress={() => onGroup(g)} onRefine={onRefine} />),
  products.length > 0 && (
    <Group key="products" title={groups.length ? t("items.product.specific") : undefined} maxRows={3}>
      {products.map((p) => (
        <Row
          key={p.code}
          title={p.name}
          detail={productDetail(p, t)}
          accessibilityLabel={fmt(t(productLabel), { name: p.name })}
          analyticsName={productAnalyticsName}
          leading={<ProductImage url={p.imageUrl} />}
          trailing={trailing}
          onPress={() => onProduct(p)}
        />
      ))}
    </Group>
  ),
];
