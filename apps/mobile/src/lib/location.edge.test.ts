import { beforeEach, describe, expect, it, vi } from "vitest";

const loc = vi.hoisted(() => ({
  requestForegroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
}));
vi.mock("expo-location", () => loc);
vi.mock("react-native", () => ({ Linking: { openSettings: vi.fn() } }));

import { requestBackgroundPermission } from "./location";

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
