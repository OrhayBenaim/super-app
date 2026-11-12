// The saved List copy on this phone, in expo-sqlite's kv-store. The only file that imports it (tests inject a fake storage into persist.ts).
import Storage from "expo-sqlite/kv-store";
import type { QueryClient } from "@tanstack/react-query";
import { createSavedCopy, keepSaved } from "@/lib/persist";

const copy = createSavedCopy(Storage);

/** Restore and keep saving the copy for `userId`; returns the stop function (an effect's cleanup). */
export const keepSavedCopy = (qc: QueryClient, userId: string) => keepSaved(qc, copy, userId)[0];

/** The one function sign-out, Account deletion and Data deletion call: the cache, the item-edit queue and the saved copy. */
export const wipeDevice = (qc: QueryClient) => copy.wipe(qc);
