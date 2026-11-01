import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import { View } from "react-native";
import type { Item } from "@/features/lists/api";
import { fmt } from "@/features/compare/format";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Tap, Text } from "@/ui";

/**
 * My items row: tap toggles the item onto / off the list, long-press edits. Off the list it shows the add
 * button; on the list a static "On the list" tag sits after the name (status, not a button).
 */
export function ItemRow({ item, onToggle, onEdit }: { item: Item; onToggle: (missing: boolean) => void; onEdit?: () => void }) {
  const { colors, space, size } = useTheme();
  return (
    <Tap
      accessibilityLabel={fmt(t(item.missing ? "items.removeFromList" : "items.addToList"), { name: item.name })}
      accessibilityHint={onEdit ? t("items.editHint") : undefined}
      accessibilityState={{ selected: item.missing }}
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
      style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row, paddingHorizontal: space[5], backgroundColor: colors.surface }}
    >
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[4] }}>
        <Text numberOfLines={2} style={{ flexShrink: 1 }}>
          {item.name}
        </Text>
        {item.missing && <OnListTag />}
      </View>
      {!item.missing && (
        <View style={{ width: size.target, alignItems: "center" }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.tintSoft, alignItems: "center", justifyContent: "center" }}>
            <Plus size={18} color={colors.tint} strokeWidth={2} />
          </View>
        </View>
      )}
    </Tap>
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
