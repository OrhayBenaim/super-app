import type { SoldBy } from "@grocer/shared/quantity";
import { Info, Tag } from "lucide-react-native";
import { View } from "react-native";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Text } from "@/ui";
import { chainLine, type ChainPromo } from "./promo";

/** Where a Chain line's text starts: under the Product's name (row padding + 48pt image + gap). */
export const chainIndent = (space: number[]) => space[5]! + 48 + space[4]!;

/**
 * One Chain running a Promotion on a Product (Figma ChainPromoRow), indented under its ProductRow: the Chain, the
 * reward (Tag, Saving green) and the Restricted label on the start side, the Promotion price over the struck Shelf price
 * on the end side. With no price we can work out, the Chain's own description (Info). Read as one element.
 */
export function ChainPromoRow({ promo, chainName, soldBy }: { promo: ChainPromo; chainName: string; soldBy: SoldBy }) {
  const { colors, space, font } = useTheme();
  const line = chainLine(promo, chainName, soldBy, t);
  const Icon = line.info ? Info : Tag;
  return (
    <View
      accessible
      accessibilityLabel={line.label}
      style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingStart: chainIndent(space), paddingEnd: space[5], paddingVertical: space[3] + space[1] }}
    >
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="body" numberOfLines={1}>
          {chainName}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
          {/* As tall as the text's first line, so the icon centres on it. */}
          <View style={{ minHeight: font.lineHeight.footnote, justifyContent: "center" }}>
            <Icon size={14} strokeWidth={1.75} color={line.info ? colors.labelSecondary : colors.saving} />
          </View>
          <Text variant="footnote" color={line.info ? "labelSecondary" : "saving"} style={{ flexShrink: 1 }}>
            {line.text}
            {line.restricted && (
              <Text variant="footnote" color="labelSecondary">
                {` · ${line.restricted}`}
              </Text>
            )}
          </Text>
        </View>
      </View>
      {line.price && (
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="priceRow" color="saving" numberOfLines={1}>
            {line.price}
          </Text>
          <Text variant="subhead" color="labelSecondary" tabular numberOfLines={1} style={{ textDecorationLine: "line-through" }}>
            {line.shelf}
          </Text>
        </View>
      )}
    </View>
  );
}
