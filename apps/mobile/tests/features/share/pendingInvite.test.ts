import { beforeEach, expect, it } from "vitest";
import { inviteCodeOf, redirectSystemPath, takePendingInvite } from "@/features/share/pendingInvite";

beforeEach(() => {
  takePendingInvite();
});

it.each(["join/ABC123", "/join/ABC123", "grocer://join/ABC123", "grocer:///join/ABC123"])("reads the Invite code from %s", (path) => {
  expect(inviteCodeOf(path)).toBe("ABC123");
});

it.each(["/", "", "/share", "join", "join/", "/join/", "join/ABC/extra", "grocer://", "grocer://expo-auth-session?code=x", "/(tabs)/join/ABC", "other://join/ABC"])(
  "reads no Invite code from %s",
  (path) => {
    expect(inviteCodeOf(path)).toBeUndefined();
  },
);

it("redirect saves an Invite link's code and returns the path unchanged", () => {
  expect(redirectSystemPath({ path: "grocer://join/ABC123" })).toBe("grocer://join/ABC123");
  expect(takePendingInvite()).toBe("ABC123");
});

it("takes a saved code once", () => {
  redirectSystemPath({ path: "join/ABC123" });
  expect(takePendingInvite()).toBe("ABC123");
  expect(takePendingInvite()).toBeUndefined();
});

it("keeps only the most recent code", () => {
  redirectSystemPath({ path: "join/FIRST1" });
  redirectSystemPath({ path: "join/SECOND" });
  expect(takePendingInvite()).toBe("SECOND");
  expect(takePendingInvite()).toBeUndefined();
});

it("redirect leaves other links and a saved code alone", () => {
  redirectSystemPath({ path: "join/KEEP01" });
  expect(redirectSystemPath({ path: "grocer://expo-auth-session?code=x" })).toBe("grocer://expo-auth-session?code=x");
  expect(takePendingInvite()).toBe("KEEP01");
});
