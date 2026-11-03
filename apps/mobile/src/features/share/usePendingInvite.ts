import { router } from "expo-router";
import { useEffect } from "react";
import { takePendingInvite } from "@/features/share/pendingInvite";

/** After sign-in, opens the join screen for an Invite link that arrived while signed out. */
export function usePendingInvite(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const code = takePendingInvite();
    if (code) router.push({ pathname: "/join/[code]", params: { code } });
  }, [ready]);
}
