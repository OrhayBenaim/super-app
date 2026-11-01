import type { Item } from "@/features/lists/api";

// A sheet route closes before an Undo toast could show, so it hands the delete to the screen it returns to.
let pending: Item | null = null;

export const requestDelete = (item: Item) => {
  pending = item;
};

export function takePendingDelete(): Item | null {
  const item = pending;
  pending = null;
  return item;
}
