import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert } from "react-native";
import { fmt } from "@/features/compare/format";
import { useItemMutations, type Item } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { Toast } from "@/ui";

/** Delete at once (no confirm) and offer Undo, which re-creates the item with the same fields. Render `toast` last in the screen. */
export function useDeleteWithUndo(listId: string | null) {
  const { add, remove } = useItemMutations(listId);
  const [deleted, setDeleted] = useState<Item | null>(null);
  const fail = () => Alert.alert(t("common.error"));

  const deleteItem = (item: Item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    remove.mutate(item.id, { onError: fail });
    setDeleted(item);
  };

  const toast = (
    <Toast
      key={deleted?.id}
      message={deleted && fmt(t("items.deleted"), { name: deleted.name })}
      action={{
        title: t("common.undo"),
        onPress: () => {
          if (!deleted) return;
          const { name, category, productCode, missing } = deleted;
          add.mutate({ name, category, productCode, missing }, { onError: fail });
        },
      }}
      onHide={() => setDeleted(null)}
    />
  );
  return { deleteItem, toast };
}
