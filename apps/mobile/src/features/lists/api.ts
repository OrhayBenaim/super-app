// Shared list data layer (types mirror docs/api.md). Both the list screens and Compare build on this.
import { useIsMutating, useQuery, useQueryClient, useMutation, type MutateOptions, type QueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { Events, track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { QUANTITY, type SoldBy } from "@grocer/shared/quantity";

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
// The poll and focus refetches pause while item edits for the List are pending: a read taken mid-burst lacks the later
// writes and would undo them on screen. The last edit to settle refetches once.
export const listDetailOptions = (id: string | null) => ({
  queryKey: listKeys.detail(id ?? ""),
  queryFn: () => api<ListDetail>(`api/lists/${id}`),
  enabled: !!id,
});
export function useList(id: string | null, { poll = true } = {}) {
  const qc = useQueryClient();
  const mutating = useIsMutating({ mutationKey: itemKeys.all, predicate: inScope(id ?? "") }) > 0;
  return useQuery({
    ...listDetailOptions(id),
    refetchInterval: poll && !mutating ? 5000 : false,
    refetchOnWindowFocus: () => !itemEditsPending(qc, id ?? ""),
  });
}

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

/**
 * Item edits (add, update, delete) are TanStack mutation defaults on the QueryClient, keyed by kind under "items", so a
 * queued edit still knows how to run when it is restored without its screen. The variables carry the List id. Every edit
 * on a List shares one `scope`, so edits go out one at a time in tap order. Each patches the cached List at once and, if it
 * fails, undoes only its own item (never a whole-List snapshot). The reply overwrites only what the server owns.
 */
export const itemKeys = {
  all: ["items"] as const,
  add: ["items", "add"] as const,
  update: ["items", "update"] as const,
  remove: ["items", "remove"] as const,
};
type ItemKind = "add" | "update" | "remove";
export const itemScope = (listId: string) => ({ id: `items:${listId}` });
/** The options a call site (or test) gives useMutation / MutationObserver for one kind of item edit on a List. */
export const itemEdit = (kind: ItemKind, listId: string) => ({ mutationKey: itemKeys[kind], scope: itemScope(listId) });

type ItemPatch = Partial<Pick<Item, "name" | "category" | "productCode" | "groupRef" | "missing" | "quantity">>;
export type NewItem = { name: string; category: string; productCode?: string | null; groupRef?: string | null; missing?: boolean; quantity?: number; soldBy?: SoldBy };
export type AddVars = NewItem & { listId: string };
export type UpdateVars = ItemPatch & { listId: string; id: string };
export type RemoveVars = { listId: string; id: string };

/** The row a new item shows until the server answers; the API's defaults (on the List, Quantity 1) fill what is left out. */
export const optimisticItem = ({ soldBy = "unit", ...body }: NewItem, listId: string, now: string): Item => ({
  id: `pending-${now}-${Math.random().toString(36).slice(2)}`,
  listId,
  name: body.name,
  category: body.category,
  productCode: body.productCode ?? null,
  groupRef: body.groupRef ?? null,
  missing: body.missing ?? true,
  quantity: body.quantity ?? QUANTITY.start,
  soldBy,
  createdAt: now,
  updatedAt: now,
});

const inScope = (listId: string) => (m: { options: { scope?: { id: string } } }) => m.options.scope?.id === itemScope(listId).id;
/** Item edits for a List that are queued, paused or in flight: reads of that List wait for them. */
export const itemEditsPending = (qc: QueryClient, listId: string) => qc.isMutating({ mutationKey: itemKeys.all, predicate: inScope(listId) });

export function registerItemEdits(qc: QueryClient) {
  const patchItems = (listId: string, fn: (items: Item[]) => Item[]) =>
    qc.setQueryData<ListDetail>(listKeys.detail(listId), (d) => (d ? { ...d, items: fn(d.items) } : d));
  const patchItem = (listId: string, id: string, fn: (i: Item) => Item) => patchItems(listId, (items) => items.map((i) => (i.id === id ? fn(i) : i)));
  // Synchronous on purpose: onMutate runs in tap order, so the cache shows the taps in order. Cancel so an in-flight poll can't overwrite them.
  const start = (listId: string) => void qc.cancelQueries({ queryKey: listKeys.detail(listId), exact: true });
  // Refetch once the last edit settles: an earlier refetch would bring back the List without the writes still to go. Self is still counted here.
  const settled = (listId: string) => {
    if (itemEditsPending(qc, listId) > 1) return;
    void qc.invalidateQueries({ queryKey: listKeys.detail(listId) });
    void qc.invalidateQueries({ queryKey: listKeys.categories(listId) });
  };

  // `soldBy` only shapes the optimistic row (the server owns it); it is not sent.
  qc.setMutationDefaults(itemKeys.add, {
    mutationFn: ({ listId, soldBy: _, ...body }: AddVars) => api<Item>(`api/lists/${listId}/items`, { method: "POST", body: JSON.stringify(body) }),
    onMutate: (vars: AddVars) => {
      start(vars.listId);
      const temp = optimisticItem(vars, vars.listId, new Date().toISOString());
      patchItems(vars.listId, (items) => [...items, temp]);
      return { tempId: temp.id };
    },
    onError: (_e: unknown, { listId }: AddVars, ctx?: { tempId: string }) => patchItems(listId, (items) => items.filter((i) => i.id !== ctx?.tempId)),
    // Swap the pending row's id for the server's now, not at the next refetch; the rest stays as tapped.
    onSuccess: (data: unknown, { listId }: AddVars, ctx?: { tempId: string }) => {
      const item = data as Item;
      patchItem(listId, ctx?.tempId ?? "", (i) => ({ ...i, id: item.id, soldBy: item.soldBy, createdAt: item.createdAt, updatedAt: item.updatedAt }));
    },
    onSettled: (_d: unknown, _e: unknown, { listId }: AddVars) => settled(listId),
  });

  qc.setMutationDefaults(itemKeys.update, {
    mutationFn: ({ listId, id, ...patch }: UpdateVars) => api<Item>(`api/lists/${listId}/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: ({ listId, id, ...patch }: UpdateVars) => {
      start(listId);
      const before = qc.getQueryData<ListDetail>(listKeys.detail(listId))?.items.find((i) => i.id === id);
      patchItem(listId, id, (i) => ({ ...i, ...patch }));
      return { before };
    },
    // Put back the fields this edit changed, unless a later edit has changed them since.
    onError: (_e: unknown, { listId, id, ...patch }: UpdateVars, ctx?: { before?: Item }) =>
      ctx?.before &&
      patchItem(listId, id, (cur) => {
        const undone: Record<string, unknown> = { ...cur };
        for (const k of Object.keys(patch) as (keyof ItemPatch)[]) if (cur[k] === patch[k]) undone[k] = ctx.before![k];
        return undone as Item;
      }),
    onSuccess: (data: unknown, { listId, id, quantity, ...patch }: UpdateVars) => {
      // The server owns soldBy, and resets the quantity on a re-match unless a later queued edit sets it.
      const item = data as Item;
      const rematch = quantity === undefined && ("productCode" in patch || "groupRef" in patch);
      const laterQuantity =
        qc.isMutating({
          mutationKey: itemKeys.update,
          predicate: (m) => inScope(listId)(m) && (m.state.variables as UpdateVars).id === id && "quantity" in (m.state.variables as UpdateVars),
        }) > 0;
      patchItem(listId, id, (i) => ({ ...i, soldBy: item.soldBy, ...(rematch && !laterQuantity && { quantity: item.quantity }) }));
      if (patch.missing === true) track(Events.listItemAdded, { existing: true });
    },
    onSettled: (_d: unknown, _e: unknown, { listId }: UpdateVars) => settled(listId),
  });

  qc.setMutationDefaults(itemKeys.remove, {
    mutationFn: ({ listId, id }: RemoveVars) => api<void>(`api/lists/${listId}/items/${id}`, { method: "DELETE" }),
    onMutate: ({ listId, id }: RemoveVars) => {
      start(listId);
      const items = qc.getQueryData<ListDetail>(listKeys.detail(listId))?.items ?? [];
      patchItems(listId, (all) => all.filter((i) => i.id !== id));
      return { item: items.find((i) => i.id === id), index: items.findIndex((i) => i.id === id) };
    },
    onError: (_e: unknown, { listId }: RemoveVars, ctx?: { item?: Item; index: number }) =>
      ctx?.item && patchItems(listId, (items) => (items.some((i) => i.id === ctx.item!.id) ? items : items.toSpliced(ctx.index, 0, ctx.item!))),
    onSettled: (_d: unknown, _e: unknown, { listId }: RemoveVars) => settled(listId),
  });
}

/** The same item edits as `add.mutate(body)`, `update.mutate({ id, ...patch })`, `remove.mutate(id)`: the hook adds the List id. */
export function useItemMutations(listId: string | null) {
  const id = listId ?? "";
  const add = useMutation<Item, Error, AddVars>(itemEdit("add", id));
  const update = useMutation<Item, Error, UpdateVars>(itemEdit("update", id));
  const remove = useMutation<void, Error, RemoveVars>(itemEdit("remove", id));
  return {
    add: { mutate: (v: NewItem, o?: MutateOptions<Item, Error, AddVars>) => add.mutate({ ...v, listId: id }, o) },
    update: { mutate: (v: Omit<UpdateVars, "listId">, o?: MutateOptions<Item, Error, UpdateVars>) => update.mutate({ ...v, listId: id }, o) },
    remove: { mutate: (itemId: string, o?: MutateOptions<void, Error, RemoveVars>) => remove.mutate({ listId: id, id: itemId }, o) },
  };
}
