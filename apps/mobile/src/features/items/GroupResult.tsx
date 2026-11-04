import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { fmt } from "@/features/compare/format";
import { Taps, type TapName } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Row, Tap, Text } from "@/ui";
import { groupFacts, groupTitle } from "./labels";
import { ProductImage } from "./ProductImage";
import type { ProductGroup } from "./products";

type Props = {
  group: ProductGroup;
  onPress: () => void;
  /** Narrow the search by one more word. */
  onRefine: (word: string) => void;
  selected?: boolean;
  trailing?: ReactNode;
  /** A store-limited search (re-matching a Missing item): only that store's price. */
  atStore?: boolean;
  analyticsName?: TapName;
};

/** A Product group search row ("בורגול · 63 products · from ₪6.80 a kilo") and its refinement chips. */
export function GroupResult({ group, onPress, onRefine, selected, trailing, atStore = false, analyticsName = Taps.itemsGroupPick }: Props) {
  const { colors, space, radius } = useTheme();
  const title = groupTitle(group, t);
  const facts = groupFacts(group, t, atStore);
  return (
    <View>
      <Row
        title={title}
        detail={facts.join(" · ")}
        accessibilityLabel={[title, ...facts].join(", ")}
        accessibilityState={selected === undefined ? undefined : { selected }}
        analyticsName={analyticsName}
        leading={<ProductImage url={group.imageUrl} />}
        trailing={trailing}
        onPress={onPress}
      />
      {group.refinements.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[2], paddingHorizontal: space[5], paddingBottom: space[4] }}>
          {group.refinements.map((word) => (
            <Tap
              key={word}
              accessibilityLabel={fmt(t("items.group.refine"), { name: `${group.name} ${word}` })}
              analyticsName={Taps.itemsGroupRefine}
              onPress={() => onRefine(word)}
              hitSlop={4}
              style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: space[4], borderRadius: radius.full, backgroundColor: colors.tintSoft }}
            >
              <Text variant="subhead" color="tint">
                {word}
              </Text>
            </Tap>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
