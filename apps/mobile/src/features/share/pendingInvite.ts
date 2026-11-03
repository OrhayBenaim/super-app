// An Invite link opened while signed out keeps its Invite code here until sign-in.
// Memory only on purpose: closing the app mid sign-in drops it, and nothing stays on the device.
let pending: string | undefined;

/** The Invite code in `join/<code>`, `/join/<code>` or `grocer://join/<code>`; undefined for any other path. */
export function inviteCodeOf(path: string): string | undefined {
  return /^(?:grocer:\/\/)?\/*join\/([^/?#]+)$/.exec(path)?.[1];
}

/** Remembers one Invite code; a newer one replaces it. */
export function savePendingInvite(code: string) {
  pending = code;
}

/** Returns the pending Invite code and forgets it, so it is used once. */
export function takePendingInvite(): string | undefined {
  const code = pending;
  pending = undefined;
  return code;
}

/** expo-router's +native-intent hook: runs for every incoming link. Saves an Invite link's code and keeps routing as is. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const code = inviteCodeOf(path);
  if (code) savePendingInvite(code);
  return path;
}
