import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchCompare: vi.fn(),
  hasStarted: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  setItem: vi.fn(),
  deleteItem: vi.fn(),
  enabled: "1" as string | null,
}));

vi.mock("@/features/compare/api", () => ({ fetchCompare: m.fetchCompare }));
vi.mock("@/lib/location", () => ({ requestBackgroundPermission: vi.fn() }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("expo-constants", () => ({ default: { appOwnership: "standalone" } }));
vi.mock("expo-notifications", () => ({ setNotificationHandler: vi.fn(), requestPermissionsAsync: vi.fn() }));
vi.mock("expo-task-manager", () => ({ defineTask: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItem: () => m.enabled,
  setItemAsync: m.setItem,
  getItemAsync: vi.fn(),
  deleteItemAsync: m.deleteItem,
}));
vi.mock("expo-location", () => ({
  hasStartedGeofencingAsync: m.hasStarted,
  stopGeofencingAsync: m.stop,
  startGeofencingAsync: m.start,
  GeofencingEventType: { Enter: 1, Exit: 2 },
}));

async function load(enabled: string | null = "1") {
  vi.resetModules();
  m.enabled = enabled;
  return import("./useNearbyAlerts");
}

beforeEach(() => {
  vi.resetAllMocks();
  m.hasStarted.mockResolvedValue(true);
});

describe("disableNearbyAlerts", () => {
  it("stops geofencing when it was started", async () => {
    const { disableNearbyAlerts } = await load();
    await disableNearbyAlerts();
    expect(m.stop).toHaveBeenCalledWith("grocer-geofence");
  });

  it("does not stop or throw when never started", async () => {
    m.hasStarted.mockResolvedValue(false);
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).resolves.toBeUndefined();
    expect(m.stop).not.toHaveBeenCalled();
  });

  it("does not stop or throw when the started check rejects", async () => {
    m.hasStarted.mockRejectedValue(new Error("no task"));
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).resolves.toBeUndefined();
    expect(m.stop).not.toHaveBeenCalled();
  });

  it("deletes stored stores and saves the setting off", async () => {
    const { disableNearbyAlerts } = await load();
    await disableNearbyAlerts();
    expect(m.deleteItem).toHaveBeenCalledWith("nearbyStores");
    expect(m.setItem).toHaveBeenCalledWith("nearbyAlertsEnabled", "0");
  });

  it("still clears stored stores and the setting when stopping geofencing fails, and reports the failure", async () => {
    m.stop.mockRejectedValue(new Error("os refused"));
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).rejects.toThrow("os refused");
    expect(m.deleteItem).toHaveBeenCalledWith("nearbyStores");
    expect(m.setItem).toHaveBeenCalledWith("nearbyAlertsEnabled", "0");
  });

  it("makes later syncGeofences a no-op", async () => {
    const { disableNearbyAlerts, syncGeofences } = await load();
    await disableNearbyAlerts();
    await syncGeofences({ lat: 32.08, lng: 34.78 }, ["1"]);
    expect(m.fetchCompare).not.toHaveBeenCalled();
  });
});
