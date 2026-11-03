// Shared list data layer (types mirror docs/api.md). Both the list screens and Compare build on this.
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { Events, track } from "@/lib/analytics";
import { api } from "@/lib/api";
import type { SoldBy } from "@grocer/shared/quantity";

export type List = { id: string; name: string; ownerId: string; role: "owner" | "member"; memberCount: number; updatedAt: string };
export type Member = { userId: string; name: string; email: string; role: "owner" | "member" };
export type Item = {
  id: string; listId: string; name: string; category: string;
  productCode: string | null; groupRef: string | null; missing: boolean;
  /** A count, or kilos when sold by weight (@grocer/shared/quantity). Kept when the item leaves the list. */
  quantity: number; soldBy: SoldBy;
  createdAt: string; updatedAt: string;
};
export type ListDetail = { list: List; members: Member[]; items: Item[] };

export const listKeys = {
  all: ["lists"] as const,
  detail: (id: string) => ["lists", id] as const,
  categories: (id: string) => ["lists", id, "categories"] as const,
};

export const useLists = () => useQuery({ queryKey: listKeys.all, queryFn: () => api<List[]>("api/lists") });

// Selected list, kept across app restarts; defaults to the first list the server returns (it auto-creates one, oldest first).
const SELECTED_KEY = "selectedListId";
const useSelectedList = create<{ id: string | null }>(() => ({ id: SecureStore.getItem(SELECTED_KEY) }));
/** The stored pick while it is still one of the user's lists (not left or removed), else the first list. */
export const currentListId = (selected: string | null, lists?: Pick<List, "id">[]) =>
  !lists ? selected : lists.some((l) => l.id === selected) ? selected : (lists[0]?.id ?? null);
export function useCurrentListId() {
  const selected = useSelectedList((s) => s.id);
  return currentListId(selected, useLists().data);
}
export function selectList(id: string) {
  useSelectedList.setState({ id });
  SecureStore.setItemAsync(SELECTED_KEY, id).catch(() => {}); // best-effort: lost on failure, the list still works this session
}

// Polling keeps a shared list in sync with the spouse; screens pass poll: useIsFocused() so hidden tabs stay quiet.
// shortcut: polling, not websockets (see docs/api.md).
export const useList = (id: string | null, { poll = true } = {}) =>
  useQuery({
    queryKey: listKeys.detail(id ?? ""),
    queryFn: () => api<ListDetail>(`api/lists/${id}`),
    enabled: !!id,
    refetchInterval: poll ? 5000 : false,
    refetchOnWindowFocus: true,
  });

export const useCategories = (id: string | null) =>
  useQuery({ queryKey: listKeys.categories(id ?? ""), queryFn: () => api<string[]>(`api/lists/${id}/categories`), enabled: !!id });

export const missingItems = (d?: ListDetail) => (d?.items ?? []).filter((i) => i.missing);
/** What an item is matched to, as Compare reports it in missingCodes: its product code or its Product group ref. */
export const matchKey = (i: Item) => i.productCode ?? i.groupRef;
/**
 * What Compare prices: the missing items matched to a product, and those matched to a Product group, each with its
 * quantity. Two items matched to one product stay two entries; the API sums them.
 */
export type Basket = { items: { code: string; quantity: number }[]; groups: { ref: string; quantity: number }[] };
export const missingBasket = (d?: ListDetail): Basket => {
  const items = missingItems(d);
  return {
    items: items.flatMap((i) => (i.productCode ? [{ code: i.productCode, quantity: i.quantity }] : [])),
    groups: items.flatMap((i) => (i.groupRef ? [{ ref: i.groupRef, quantity: i.quantity }] : [])),
  };
};
export const basketSize = (b: Basket) => b.items.length + b.groups.length;

type ItemPatch = Partial<Pick<Item, "name" | "category" | "productCode" | "groupRef" | "missing" | "quantity">>;

// Optimistic item mutations so toggles feel instant; the poll reconciles with the server.
export function useItemMutations(listId: string | null) {
  const qc = useQueryClient();
  const key = listKeys.detail(listId ?? "");
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: listKeys.categories(listId ?? "") });
  };
  // Returns the previous snapshot so onError can roll back; cancel first so an in-flight poll can't overwrite it.
  const patchCache = async (fn: (items: Item[]) => Item[]) => {
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<ListDetail>(key);
    qc.setQueryData<ListDetail>(key, (d) => (d ? { ...d, items: fn(d.items) } : d));
    return { previous };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { previous?: ListDetail }) => {
    if (ctx?.previous) qc.setQueryData(key, ctx.previous);
  };

  const add = useMutation({
    mutationFn: (body: { name: string; category: string; productCode?: string | null; groupRef?: string | null; missing?: boolean }) =>
      api<Item>(`api/lists/${listId}/items`, { method: "POST", body: JSON.stringify(body) }),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: ItemPatch & { id: string }) =>
      api<Item>(`api/lists/${listId}/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: ({ id, ...patch }) => patchCache((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    onError: rollback,
    onSuccess: (item, { missing }) => {
      // The server may reset the quantity on a re-match and owns soldBy: show its item now, not at the next poll.
      qc.setQueryData<ListDetail>(key, (d) => (d ? { ...d, items: d.items.map((i) => (i.id === item.id ? item : i)) } : d));
      if (missing === true) track(Events.listItemAdded, { existing: true });
    },
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`api/lists/${listId}/items/${id}`, { method: "DELETE" }),
    onMutate: (id) => patchCache((items) => items.filter((i) => i.id !== id)),
    onError: rollback,
    onSettled: invalidate,
  });
  return { add, update, remove };
}
