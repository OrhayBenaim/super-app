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
  return import("@/features/geofence/useNearbyAlerts");
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

  it("still saves the setting off when deleting the stored stores fails, and reports the failure", async () => {
    m.deleteItem.mockRejectedValue(new Error("keychain"));
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).rejects.toThrow("keychain");
    expect(m.setItem).toHaveBeenCalledWith("nearbyAlertsEnabled", "0");
  });

  it("a sync still fetching when alerts are turned off leaves no geofence or stored stores behind", async () => {
    let respond!: (v: unknown) => void;
    m.fetchCompare.mockReturnValue(new Promise((r) => (respond = r)));
    const { disableNearbyAlerts, syncGeofences } = await load();
    const sync = syncGeofences({ lat: 32.08, lng: 34.78 }, ["1"]);
    await disableNearbyAlerts();
    respond({ stores: [{ storeId: "s1", chainName: "C", storeName: "s1", total: 1, lat: 32, lng: 34 }], unmatched: [] });
    await sync;
    const last = (fn: { mock: { invocationCallOrder: number[] } }) => Math.max(0, ...fn.mock.invocationCallOrder);
    if (m.start.mock.calls.length) expect(last(m.stop)).toBeGreaterThan(last(m.start));
    const storesWrites = m.setItem.mock.calls.flatMap((c, i) => (c[0] === "nearbyStores" ? [m.setItem.mock.invocationCallOrder[i]] : []));
    if (storesWrites.length) expect(last(m.deleteItem)).toBeGreaterThan(Math.max(...storesWrites));
    expect(m.setItem).toHaveBeenLastCalledWith("nearbyAlertsEnabled", "0");
  });

  it("makes later syncGeofences a no-op", async () => {
    const { disableNearbyAlerts, syncGeofences } = await load();
    await disableNearbyAlerts();
    await syncGeofences({ lat: 32.08, lng: 34.78 }, ["1"]);
    expect(m.fetchCompare).not.toHaveBeenCalled();
  });
});
