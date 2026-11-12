import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ signOut: vi.fn(), wipe: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: m.signOut } }));
vi.mock("@/features/lists/saved", () => ({ wipeDevice: m.wipe }));

import { signOut } from "@/features/account/signOut";

const qc = {} as QueryClient;

beforeEach(() => {
  vi.resetAllMocks();
  m.wipe.mockResolvedValue(undefined);
});

describe("signOut", () => {
  it("signs out, then wipes the phone (cache, queue and saved copy)", async () => {
    const order: string[] = [];
    m.signOut.mockImplementation(async () => (order.push("signOut"), { error: null }));
    m.wipe.mockImplementation(async () => void order.push("wipe"));
    await signOut(qc);
    expect(order).toEqual(["signOut", "wipe"]);
    expect(m.wipe).toHaveBeenCalledWith(qc);
  });

  it("keeps the phone's data when signing out fails: the User is still signed in", async () => {
    m.signOut.mockResolvedValue({ error: { status: 0, message: "network" } });
    await signOut(qc);
    expect(m.wipe).not.toHaveBeenCalled();
  });
});
