// The List copy saved on the phone: opens List and My items at once, and keeps item edits made offline across a restart.
// Plain TS on purpose: the storage is injected (src/lib/saved.ts gives it expo-sqlite's kv-store), so tests run in Node.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient, type AsyncStorage, type PersistQueryClientOptions, type Persister } from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { itemKeys, listKeys } from "@/features/lists/api";

export const SAVED_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SAVED_KEY = "grocer-saved-copy";

/** Only the lists query, the List detail queries and their categories (all under "lists"), plus item edits still to be sent. */
const dehydrateOptions: PersistQueryClientOptions["dehydrateOptions"] = {
  shouldDehydrateQuery: (q) => q.queryKey[0] === listKeys.all[0] && q.state.status === "success",
  // Pending covers waiting, paused and in flight: an edit cut off mid-send is sent again (add and update are safe to repeat, a delete of a gone item counts as done).
  shouldDehydrateMutation: (m) => m.options.mutationKey?.[0] === itemKeys.all[0] && m.state.status === "pending",
};

/** The saved copy in `storage`. `throttleTime` is how long a burst of taps waits before one write. */
export function createSavedCopy(storage: AsyncStorage<string>, throttleTime = 250) {
  // A write already waiting on the throttle holds the cache as it was before a wipe; sealing keeps it from landing.
  let sealed = false;
  const inner = createAsyncStoragePersister({
    storage: { getItem: (k) => storage.getItem(k), removeItem: (k) => storage.removeItem(k), setItem: (k, v) => (sealed ? undefined : storage.setItem(k, v)) },
    key: SAVED_KEY,
    throttleTime,
  });
  const persister: Persister = {
    ...inner,
    // Nothing is in flight after a restart: mark every restored edit paused so resumePausedMutations sends it.
    restoreClient: async () => {
      const copy = await inner.restoreClient();
      copy?.clientState.mutations.forEach((m) => (m.state = { ...m.state, isPaused: true }));
      return copy;
    },
  };
  return {
    persister,
    open: () => void (sealed = false),
    /** Sign-out, Account deletion and Data deletion: the cache, the edit queue and the saved copy, all gone. */
    async wipe(qc: QueryClient) {
      sealed = true;
      qc.clear();
      await storage.removeItem(SAVED_KEY);
    },
  };
}
export type SavedCopy = ReturnType<typeof createSavedCopy>;

/**
 * Restores the copy saved for `userId` (a copy for another User, or older than 30 days, is thrown away), sends the queued
 * edits once the phone is online, then keeps saving. Returns [stop, restored]. Queries of a List stay in memory forever
 * (never garbage collected) so a List nobody is viewing does not drop out of the copy.
 */
export function keepSaved(qc: QueryClient, copy: SavedCopy, userId: string): [() => void, Promise<void>] {
  copy.open();
  qc.setQueryDefaults(listKeys.all, { gcTime: Infinity });
  const [stop, restored] = persistQueryClient({ queryClient: qc, persister: copy.persister, buster: userId, maxAge: SAVED_MAX_AGE, dehydrateOptions });
  return [stop, restored.then(() => void qc.resumePausedMutations()).catch(() => {})];
}
