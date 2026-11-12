import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { invalidateLists, listKeys, selectList, type List, type ListDetail } from "@/features/lists/api";
import { Events, track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { t } from "@/lib/strings";

export function useShareMutations(listId: string | null) {
  const qc = useQueryClient();
  const refresh = () => invalidateLists(qc);

  const invite = useMutation({
    mutationFn: () => api<{ code: string; url: string }>(`api/lists/${listId}/invite`, { method: "POST" }),
    onSuccess: () => listId && track(Events.listShared, { listId }),
  });
  const join = useMutation({
    mutationFn: (code: string) => api<List>("api/lists/join", { method: "POST", body: JSON.stringify({ code: code.trim() }) }),
    onSuccess: async (list) => {
      track(Events.listJoined, { listId: list.id });
      await refresh();
      selectList(list.id);
    },
  });
  // Removing yourself = leaving; useCurrentListId then falls back to the first remaining list.
  const removeMember = useMutation({
    mutationFn: (userId: string) => api<void>(`api/lists/${listId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => refresh(),
  });

  const rename = useMutation(renameList(qc, listId));
  return { invite, join, removeMember, rename };
}

/**
 * The Owner's rename, as mutation options (plain TS, so it is tested without React). Optimistic on both caches: the name
 * shows in the title, the Lists sheet and the Share sheet. Cancel first so an in-flight poll can't overwrite it. The alert
 * lives here, not in a mutate() callback, so it still shows when the sheet is closed before the save fails.
 */
export function renameList(qc: QueryClient, listId: string | null) {
  const detailKey = listKeys.detail(listId ?? "");
  const setName = (name: string) => {
    qc.setQueryData<List[]>(listKeys.all, (ls) => ls?.map((l) => (l.id === listId ? { ...l, name } : l)));
    qc.setQueryData<ListDetail>(detailKey, (d) => (d ? { ...d, list: { ...d.list, name } } : d));
  };
  return {
    mutationFn: (name: string) => api<List>(`api/lists/${listId}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onMutate: async (name: string) => {
      await Promise.all([qc.cancelQueries({ queryKey: listKeys.all, exact: true }), qc.cancelQueries({ queryKey: detailKey, exact: true })]);
      const previous = { lists: qc.getQueryData<List[]>(listKeys.all), detail: qc.getQueryData<ListDetail>(detailKey) };
      setName(name.trim());
      return previous;
    },
    onError: (_e: unknown, _name: string, previous?: { lists?: List[]; detail?: ListDetail }) => {
      if (previous?.lists) qc.setQueryData(listKeys.all, previous.lists);
      if (previous?.detail) qc.setQueryData(detailKey, previous.detail);
      Alert.alert(t("common.error"));
    },
    onSettled: () => invalidateLists(qc),
  };
}
