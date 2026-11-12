import { stepQuantity } from "@grocer/shared/quantity";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { useItemMutations, type Item } from "@/features/lists/api";
import { Events, track } from "@/lib/analytics";
import { cardSend, cardView, productView, type CardTarget } from "./card";

/** Where the card was tapped, for analytics. */
export type CardScreen = "home" | "promotions";

/**
 * A card's stepper and action against the current List's `items`: the stepper does nothing until Add, Update or
 * switch, which are optimistic (useItemMutations rolls back on error). Then the stepper follows the Item again.
 * With `group`, `target` is one of that group's Products on its product page (productView).
 */
export function useCard(target: CardTarget, listId: string | null, items: Item[], screen: CardScreen, group?: CardTarget) {
  const { add, update } = useItemMutations(listId);
  const [picked, setPicked] = useState<number | null>(null);
  const view = group ? productView(items, group, target, picked) : cardView(items, target, picked);

  const step = (dir: 1 | -1) => setPicked(stepQuantity(view.quantity, view.soldBy, dir));
  const act = () => {
    const send = cardSend(view, target);
    if (!send || !listId) return;
    Haptics.selectionAsync();
    if (send.kind === "add") {
      add.mutate({ ...send.body, soldBy: target.soldBy });
      track(Events.listItemAdded, { existing: false, matched: true, matchedKind: send.body.groupRef ? "group" : "product", screen });
    } else {
      update.mutate({ id: send.id, ...send.patch });
      if (!send.patch.missing && !send.patch.productCode) track(Events.itemQuantityChanged, { soldBy: view.soldBy, quantity: send.patch.quantity, screen });
    }
    setPicked(null);
  };
  return { view, step, act };
}
