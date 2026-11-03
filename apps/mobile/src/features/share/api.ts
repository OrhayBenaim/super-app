import { useMutation, useQueryClient } from "@tanstack/react-query";
import { listKeys, selectList, type List } from "@/features/lists/api";
import { Events, track } from "@/lib/analytics";
import { api } from "@/lib/api";

export function useShareMutations(listId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: listKeys.all });

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
  return { invite, join, removeMember };
}
