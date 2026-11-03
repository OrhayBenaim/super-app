import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import { View } from "react-native";
import type { Item } from "@/features/lists/api";
import { fmt } from "@/features/compare/format";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";
import { AmountPill } from "./AmountPill";

/**
 * My items row: tap toggles the item onto / off the list, long-press edits. Off the list it shows the add
 * button; on the list a static "On the list" tag sits after the name (status, not a button) and the add button's
 * slot holds the amount pill, a sibling of the row so VoiceOver reaches both.
 */
export function ItemRow({ item, onToggle, onEdit }: { item: Item; onToggle: (missing: boolean) => void; onEdit?: () => void }) {
  const { colors, space, size } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface }}>
      <Tap
        accessibilityLabel={fmt(t(item.missing ? "items.removeFromList" : "items.addToList"), { name: item.name })}
        accessibilityHint={onEdit ? t("items.editHint") : undefined}
        accessibilityState={{ selected: item.missing }}
        analyticsName={item.missing ? Taps.itemsRemoveFromList : Taps.itemsAddToList}
        scaleTo={1}
        onPress={() => {
          Haptics.selectionAsync();
          onToggle(!item.missing);
        }}
        onLongPress={
          onEdit &&
          (() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onEdit();
          })
        }
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row, paddingStart: space[5], paddingEnd: item.missing ? space[4] : space[5] }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[4] }}>
          <Text numberOfLines={2} style={{ flexShrink: 1 }}>
            {item.name}
          </Text>
          {item.missing && <OnListTag />}
        </View>
        {!item.missing && <AddBadge />}
      </Tap>
      {item.missing && (
        <View style={{ paddingEnd: space[5] }}>
          <AmountPill item={item} screen="items" />
        </View>
      )}
    </View>
  );
}

/** The round + at the end of a row that adds something. */
export function AddBadge() {
  const { colors, size } = useTheme();
  return (
    <View style={{ width: size.target, alignItems: "center" }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.tintSoft, alignItems: "center", justifyContent: "center" }}>
        <Plus size={18} color={colors.tint} strokeWidth={2} />
      </View>
    </View>
  );
}

function OnListTag() {
  const { colors } = useTheme();
  return (
    <View style={{ height: 18, paddingHorizontal: 6, borderRadius: 4, backgroundColor: colors.tintSoft, justifyContent: "center" }}>
      <Text variant="caption" color="tint" style={{ fontSize: 11, lineHeight: 14, fontWeight: "600" }}>
        {t("items.onList")}
      </Text>
    </View>
  );
}
