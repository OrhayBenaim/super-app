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
    m.signOut.mockImplementation(async () => void order.push("signOut"));
    m.wipe.mockImplementation(async () => void order.push("wipe"));
    await signOut(qc);
    expect(order).toEqual(["signOut", "wipe"]);
    expect(m.wipe).toHaveBeenCalledWith(qc);
  });

  it("wipes even when signing out fails", async () => {
    m.signOut.mockRejectedValue(new Error("network"));
    await signOut(qc).catch(() => {});
    expect(m.wipe).toHaveBeenCalledWith(qc);
  });
});
