// The saved List copy on this phone, in expo-sqlite's kv-store. The only file that imports it (tests inject a fake storage into persist.ts).
import * as Sentry from "@sentry/react-native";
import Storage from "expo-sqlite/kv-store";
import type { QueryClient } from "@tanstack/react-query";
import { createSavedCopy, keepSaved } from "./persist";

const copy = createSavedCopy(Storage);

/** Restore and keep saving the copy for `userId`; returns the stop function (an effect's cleanup). A failed restore is reported. */
export function keepSavedCopy(qc: QueryClient, userId: string) {
  const [stop, restored] = keepSaved(qc, copy, userId);
  restored.catch((e: unknown) => Sentry.captureException(e));
  return stop;
}

/** The one function sign-out and Account deletion call: the cache, the item-edit queue and the saved copy. */
export const wipeDevice = (qc: QueryClient) => copy.wipe(qc);
