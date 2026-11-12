// The List copy saved on the phone: opens List and My items at once, and keeps item edits made offline across a restart.
// Plain TS on purpose: the storage is injected (src/lib/saved.ts gives it expo-sqlite's kv-store), so tests run in Node.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient, type AsyncStorage, type PersistQueryClientOptions, type Persister } from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { itemKeys, listKeys, useRestoring } from "@/features/lists/api";

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
  // Whose copy the cache holds now; a different User signing in (no Sign out between) starts from nothing.
  let owner: string | null = null;
  const clear = (qc: QueryClient) => {
    sealed = true;
    qc.clear();
    return storage.removeItem(SAVED_KEY);
  };
  const inner = createAsyncStoragePersister({
    storage: { getItem: (k) => storage.getItem(k), removeItem: (k) => storage.removeItem(k), setItem: (k, v) => (sealed ? undefined : storage.setItem(k, v)) },
    key: SAVED_KEY,
    throttleTime,
  });
  const persister: Persister = {
    ...inner,
    // Nothing is in flight after a restart: mark every restored edit paused so resumePausedMutations sends it.
    // Past SAVED_MAX_AGE the queries go but the queued edits stay (no age limit on them), so the copy is made fresh.
    restoreClient: async () => {
      const copy = await inner.restoreClient();
      if (!copy) return copy;
      if (Date.now() - copy.timestamp > SAVED_MAX_AGE) {
        copy.clientState.queries = [];
        copy.timestamp = Date.now();
      }
      copy.clientState.mutations.forEach((m) => (m.state = { ...m.state, isPaused: true }));
      return copy;
    },
  };
  return {
    persister,
    /** `userId` is about to be saved: if the cache holds another User's, wipe it first. */
    async begin(qc: QueryClient, userId: string) {
      const other = owner !== null && owner !== userId;
      owner = userId;
      if (other) await clear(qc);
      sealed = false;
    },
    /** Sign-out and Account deletion: the cache, the edit queue and the saved copy, all gone. */
    async wipe(qc: QueryClient) {
      owner = null;
      await clear(qc);
    },
  };
}
export type SavedCopy = ReturnType<typeof createSavedCopy>;

/**
 * Restores the copy saved for `userId` (a copy for another User is thrown away; one older than 30 days keeps only its
 * queued edits), sends the queued edits once the phone is online, then keeps saving. Returns [stop, restored]. Until
 * `restored` settles, List reads wait (useRestoring), so none lands over rows a restored edit changed. Queries of a List
 * stay in memory forever (never garbage collected) so a List nobody is viewing does not drop out of the copy.
 */
export function keepSaved(qc: QueryClient, copy: SavedCopy, userId: string): [() => void, Promise<void>] {
  useRestoring.setState({ restoring: true });
  qc.setQueryDefaults(listKeys.all, { gcTime: Infinity });
  let stopped = false;
  let stopSaving = () => {};
  const restored = copy
    .begin(qc, userId)
    .then(() => {
      if (stopped) return;
      // maxAge is the copy's own rule (restoreClient above), not the library's all-or-nothing one.
      const [stop, done] = persistQueryClient({ queryClient: qc, persister: copy.persister, buster: userId, maxAge: Infinity, dehydrateOptions });
      stopSaving = stop;
      return done;
    })
    .then(() => void qc.resumePausedMutations())
    .catch(() => {})
    .finally(() => {
      if (!stopped) useRestoring.setState({ restoring: false });
    });
  return [() => ((stopped = true), stopSaving()), restored];
}
