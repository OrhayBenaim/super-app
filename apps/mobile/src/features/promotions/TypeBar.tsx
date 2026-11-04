import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import * as Haptics from "expo-haptics";
import { ScrollView, View } from "react-native";
import { typeNameKey } from "@/features/home/card";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";

/** The Product type bar: "All", then the fixed list (Other last), as 32pt chips in 44pt targets; scrolls sideways. */
export function TypeBar({ value, onChange }: { value: ProductType | null; onChange: (type: ProductType | null) => void }) {
  const { colors, space, radius, size } = useTheme();
  const chips: [ProductType | null, string][] = [[null, t("promotions.all")], ...PRODUCT_TYPES.map((p): [ProductType, string] => [p, t(typeNameKey(p))])];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={t("promotions.types")}
      contentContainerStyle={{ gap: space[3], paddingHorizontal: space[5], paddingBottom: space[2] }}
      style={{ flexGrow: 0, marginHorizontal: -space[5] }}
    >
      {chips.map(([type, name]) => {
        const selected = type === value;
        return (
          <Tap
            key={type ?? "all"}
            accessibilityRole="tab"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            analyticsName={Taps.promotionsType}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync();
              onChange(type);
            }}
            style={{ minHeight: size.target, justifyContent: "center" }}
          >
            <View style={{ height: size.segmented, justifyContent: "center", paddingHorizontal: space[5], borderRadius: radius.full, backgroundColor: selected ? colors.tint : colors.surface }}>
              <Text variant="subhead" color={selected ? "tintOn" : "label"} numberOfLines={1}>
                {name}
              </Text>
            </View>
          </Tap>
        );
      })}
    </ScrollView>
  );
}
