import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { wipeDevice } from "@/features/lists/saved";

/** Sign out, then clear what this User left on the phone: the next person to sign in never sees their List. */
export async function signOut(queryClient: QueryClient) {
  try {
    await authClient.signOut();
  } finally {
    await wipeDevice(queryClient);
  }
}
