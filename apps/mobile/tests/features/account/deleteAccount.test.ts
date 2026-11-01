import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ deleteUser: vi.fn(), disable: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({ authClient: { deleteUser: m.deleteUser } }));
vi.mock("@/features/geofence/useNearbyAlerts", () => ({ disableNearbyAlerts: m.disable }));

import { deleteAccount } from "@/features/account/deleteAccount";

const clear = vi.fn();
const qc = { clear } as unknown as QueryClient;

beforeEach(() => {
  vi.resetAllMocks();
  m.disable.mockResolvedValue(undefined);
});

describe("deleteAccount", () => {
  it("clears the cache and disables alerts on success", async () => {
    m.deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    expect(await deleteAccount(qc)).toBe("deleted");
    expect(clear).toHaveBeenCalledOnce();
    expect(m.disable).toHaveBeenCalledOnce();
  });

  it("returns reauth on SESSION_EXPIRED and cleans nothing", async () => {
    m.deleteUser.mockResolvedValue({ data: null, error: { code: "SESSION_EXPIRED", status: 400 } });
    expect(await deleteAccount(qc)).toBe("reauth");
    expect(clear).not.toHaveBeenCalled();
    expect(m.disable).not.toHaveBeenCalled();
  });

  it("returns failed on any other error and cleans nothing", async () => {
    m.deleteUser.mockResolvedValue({ data: null, error: { code: "X", message: "boom", status: 500 } });
    expect(await deleteAccount(qc)).toBe("failed");
    expect(clear).not.toHaveBeenCalled();
    expect(m.disable).not.toHaveBeenCalled();
  });

  it("returns failed when the request rejects", async () => {
    m.deleteUser.mockRejectedValue(new Error("network"));
    expect(await deleteAccount(qc)).toBe("failed");
    expect(clear).not.toHaveBeenCalled();
    expect(m.disable).not.toHaveBeenCalled();
  });

  it("is still deleted (cache cleared) when disableNearbyAlerts rejects", async () => {
    m.deleteUser.mockResolvedValue({ data: { success: true }, error: null });
    m.disable.mockRejectedValue(new Error("location"));
    expect(await deleteAccount(qc)).toBe("deleted");
    expect(clear).toHaveBeenCalledOnce();
  });
});
