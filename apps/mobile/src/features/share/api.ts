import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { listKeys, selectList, type List, type ListDetail } from "@/features/lists/api";
import { Events, track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { t } from "@/lib/strings";

export function useShareMutations(listId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: listKeys.all });
  const detailKey = listKeys.detail(listId ?? "");

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

  // The name shows in the title, the Lists sheet and the Share sheet, so rename writes both caches.
  const setName = (name: string) => {
    qc.setQueryData<List[]>(listKeys.all, (ls) => ls?.map((l) => (l.id === listId ? { ...l, name } : l)));
    qc.setQueryData<ListDetail>(detailKey, (d) => (d ? { ...d, list: { ...d.list, name } } : d));
  };
  // Owner only. Optimistic; cancel first so an in-flight poll can't overwrite the new name. The alert lives here, not in
  // a mutate() callback, so it still shows when the sheet is closed before the save fails.
  const rename = useMutation({
    mutationFn: (name: string) => api<List>(`api/lists/${listId}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onMutate: async (name) => {
      await Promise.all([qc.cancelQueries({ queryKey: listKeys.all, exact: true }), qc.cancelQueries({ queryKey: detailKey, exact: true })]);
      const previous = { lists: qc.getQueryData<List[]>(listKeys.all), detail: qc.getQueryData<ListDetail>(detailKey) };
      setName(name.trim());
      return previous;
    },
    onError: (_e, _name, previous) => {
      if (previous?.lists) qc.setQueryData(listKeys.all, previous.lists);
      if (previous?.detail) qc.setQueryData(detailKey, previous.detail);
      Alert.alert(t("common.error"));
    },
    onSettled: refresh,
  });
  return { invite, join, removeMember, rename };
}
