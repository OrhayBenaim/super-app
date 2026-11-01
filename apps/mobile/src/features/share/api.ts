import { useMutation, useQueryClient } from "@tanstack/react-query";
import { listKeys, selectList, type List } from "@/features/lists/api";
import { api } from "@/lib/api";

export function useShareMutations(listId: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: listKeys.all });

  const invite = useMutation({
    mutationFn: () => api<{ code: string; url: string }>(`api/lists/${listId}/invite`, { method: "POST" }),
  });
  const join = useMutation({
    mutationFn: (code: string) => api<List>("api/lists/join", { method: "POST", body: JSON.stringify({ code: code.trim() }) }),
    onSuccess: async (list) => {
      await refresh();
      selectList(list.id);
    },
  });
  // Removing yourself = leaving; then fall back to the first remaining list.
  const removeMember = useMutation({
    mutationFn: ({ userId }: { userId: string; self: boolean }) => api<void>(`api/lists/${listId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: async (_, { self }) => {
      if (self) selectList(null);
      await refresh();
    },
  });
  return { invite, join, removeMember };
}
