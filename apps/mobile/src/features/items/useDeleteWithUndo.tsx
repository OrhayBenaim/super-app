import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { fmt } from "@/features/compare/format";
import { reAdd, useItemMutations, type Item } from "@/features/lists/api";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { Toast } from "@/ui";
import { takePendingDelete } from "./pendingDelete";

/**
 * Delete at once (no confirm) and offer Undo, which re-creates the item with the same fields. Render `toast` last in the screen.
 * Also runs a delete requested from the item sheet route when this screen regains focus.
 */
export function useDeleteWithUndo(listId: string | null) {
  const { add, remove } = useItemMutations(listId);
  const [deleted, setDeleted] = useState<Item | null>(null);

  const deleteItem = (item: Item, via: "swipe" | "sheet") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track(Events.itemDeleted, { via });
    remove.mutate(item.id);
    setDeleted(item);
  };

  useFocusEffect(
    useCallback(() => {
      const item = takePendingDelete();
      if (item) deleteItem(item, "sheet");
    }, [listId]),
  );

  const toast = (
    <Toast
      key={deleted?.id}
      message={deleted && fmt(t("items.deleted"), { name: deleted.name })}
      action={{
        title: t("common.undo"),
        analyticsName: Taps.commonUndo,
        onPress: () => {
          if (!deleted) return;
          add.mutate(reAdd(deleted));
        },
      }}
      onHide={() => setDeleted(null)}
    />
  );
  return { deleteItem, toast };
}
