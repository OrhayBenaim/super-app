import { beforeEach, describe, expect, it, vi } from "vitest";

const loc = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
  PermissionStatus: { UNDETERMINED: "undetermined" },
}));
vi.mock("expo-location", () => loc);
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import { foregroundPermission, requestBackgroundPermission } from "@/lib/location";

beforeEach(() => vi.resetAllMocks());

describe("requestBackgroundPermission", () => {
  it("foreground denied: returns false and never asks for background", async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    expect(await requestBackgroundPermission()).toBe(false);
    expect(loc.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it("foreground granted, background denied: false", async () => {
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    loc.requestBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
    expect(await requestBackgroundPermission()).toBe(false);
  });
  it("both granted: true, foreground asked first", async () => {
    const order: string[] = [];
    loc.requestForegroundPermissionsAsync.mockImplementation(async () => (order.push("fg"), { granted: true }));
    loc.requestBackgroundPermissionsAsync.mockImplementation(async () => (order.push("bg"), { granted: true }));
    expect(await requestBackgroundPermission()).toBe(true);
    expect(order).toEqual(["fg", "bg"]);
  });
  it("propagates native errors (callers must catch)", async () => {
    loc.requestForegroundPermissionsAsync.mockRejectedValue(new Error("native"));
    await expect(requestBackgroundPermission()).rejects.toThrow("native");
  });
});

describe("foregroundPermission", () => {
  it("never answered: asks once, even for concurrent callers", async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: "undetermined", granted: false });
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted", granted: true });
    const [a, b] = await Promise.all([foregroundPermission(), foregroundPermission()]);
    expect(a.granted && b.granted).toBe(true);
    expect(loc.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
  it("already answered: reads without asking", async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: "denied", granted: false, canAskAgain: true });
    expect((await foregroundPermission()).status).toBe("denied");
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
