// Shared list data layer (types mirror docs/api.md). Both the list screens and Compare build on this.
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { create } from "zustand";
import { api } from "@/lib/api";

export type List = { id: string; name: string; ownerId: string; role: "owner" | "member"; memberCount: number; updatedAt: string };
export type Member = { userId: string; name: string; email: string; role: "owner" | "member" };
export type Item = {
  id: string; listId: string; name: string; category: string;
  productCode: string | null; missing: boolean; createdAt: string; updatedAt: string;
};
export type ListDetail = { list: List; members: Member[]; items: Item[] };

export const listKeys = {
  all: ["lists"] as const,
  detail: (id: string) => ["lists", id] as const,
  categories: (id: string) => ["lists", id, "categories"] as const,
};

export const useLists = () => useQuery({ queryKey: listKeys.all, queryFn: () => api<List[]>("api/lists") });

// Selected list; defaults to the first list the server returns (it auto-creates "My list").
const useSelectedList = create<{ id: string | null; select: (id: string | null) => void }>((set) => ({
  id: null,
  select: (id) => set({ id }),
}));
export function useCurrentListId() {
  const selected = useSelectedList((s) => s.id);
  const { data } = useLists();
  return selected ?? data?.[0]?.id ?? null;
}
export const selectList = (id: string | null) => useSelectedList.getState().select(id);

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
export const missingCodes = (d?: ListDetail) => missingItems(d).flatMap((i) => (i.productCode ? [i.productCode] : []));

type ItemPatch = Partial<Pick<Item, "name" | "category" | "productCode" | "missing">>;

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
    mutationFn: (body: { name: string; category: string; productCode?: string | null; missing?: boolean }) =>
      api<Item>(`api/lists/${listId}/items`, { method: "POST", body: JSON.stringify(body) }),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...patch }: ItemPatch & { id: string }) =>
      api<Item>(`api/lists/${listId}/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: ({ id, ...patch }) => patchCache((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    onError: rollback,
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
