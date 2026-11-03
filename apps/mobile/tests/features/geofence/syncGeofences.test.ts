import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchCompare: vi.fn(),
  hasStarted: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  setItem: vi.fn(),
  enabled: "1" as string | null,
}));

vi.mock("@/features/compare/api", () => ({ fetchCompare: m.fetchCompare }));
vi.mock("@/lib/location", () => ({ requestBackgroundPermission: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: vi.fn() })); // the lists data layer (basketSize) imports it
vi.mock("@/lib/analytics", () => ({ Events: {}, track: vi.fn() }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("expo-constants", () => ({ default: { appOwnership: "standalone" } }));
vi.mock("expo-notifications", () => ({ setNotificationHandler: vi.fn(), requestPermissionsAsync: vi.fn() }));
vi.mock("expo-task-manager", () => ({ defineTask: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItem: () => m.enabled, setItemAsync: m.setItem, getItemAsync: vi.fn() }));
vi.mock("expo-location", () => ({
  hasStartedGeofencingAsync: m.hasStarted,
  stopGeofencingAsync: m.stop,
  startGeofencingAsync: m.start,
  GeofencingEventType: { Enter: 1, Exit: 2 },
}));

const coords = { lat: 32.08, lng: 34.78 };
const store = (id: string, total: number) => ({ storeId: id, chainName: "Chain", storeName: id, total, lat: 32, lng: 34 });

async function load(enabled: string | null = "1") {
  vi.resetModules();
  m.enabled = enabled;
  return import("@/features/geofence/useNearbyAlerts");
}

beforeEach(() => {
  vi.resetAllMocks();
  m.hasStarted.mockResolvedValue(true);
});

describe("syncGeofences", () => {
  it("does nothing when alerts are disabled (SecureStore flag not '1')", async () => {
    const { syncGeofences } = await load("0");
    await syncGeofences(coords, { items: [{ code: "a", quantity: 1 }], groups: [] });
    expect(m.fetchCompare).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it("empty basket stops geofencing and does not hit the API", async () => {
    const { syncGeofences } = await load();
    await syncGeofences(coords, { items: [], groups: [] });
    expect(m.fetchCompare).not.toHaveBeenCalled();
    expect(m.stop).toHaveBeenCalledWith("grocer-geofence");
  });

  it("empty basket does not call stop when nothing is running", async () => {
    m.hasStarted.mockResolvedValue(false);
    const { syncGeofences } = await load();
    await syncGeofences(coords, { items: [], groups: [] });
    expect(m.stop).not.toHaveBeenCalled();
  });

  it("requests price-sorted stores within 20 km, limit 20, with the coords and items", async () => {
    m.fetchCompare.mockResolvedValue({ stores: [store("s1", 10)], unmatched: [] });
    const { syncGeofences } = await load();
    await syncGeofences(coords, { items: [{ code: "111", quantity: 1 }, { code: "222", quantity: 2 }], groups: [] });
    expect(m.fetchCompare).toHaveBeenCalledWith({ lat: 32.08, lng: 34.78, radiusKm: 20, items: [{ code: "111", quantity: 1 }, { code: "222", quantity: 2 }], groups: [], sort: "price", limit: 20 });
  });

  it("a basket of only groups is not empty: it is compared with its groups", async () => {
    m.fetchCompare.mockResolvedValue({ stores: [store("s1", 10)], unmatched: [] });
    const { syncGeofences } = await load();
    await syncGeofences(coords, { items: [], groups: [{ ref: "בורגול|kg", quantity: 1 }] });
    expect(m.stop).not.toHaveBeenCalled();
    expect(m.fetchCompare).toHaveBeenCalledWith({ lat: 32.08, lng: 34.78, radiusKm: 20, items: [], groups: [{ ref: "בורגול|kg", quantity: 1 }], sort: "price", limit: 20 });
    expect(m.start).toHaveBeenCalled();
  });

  it("stores [label, total] keyed by storeId in SecureStore, then arms 250 m regions", async () => {
    m.fetchCompare.mockResolvedValue({ stores: [store("s1", 10.5), store("s2", 12)], unmatched: [] });
    const { syncGeofences } = await load();
    await syncGeofences(coords, { items: [{ code: "1", quantity: 1 }], groups: [] });
    expect(m.setItem).toHaveBeenCalledWith("nearbyStores", JSON.stringify({ s1: ["Chain s1", 10.5], s2: ["Chain s2", 12] }));
    const [task, regions] = m.start.mock.calls[0];
    expect(task).toBe("grocer-geofence");
    expect(regions.map((r: { identifier: string; radius: number }) => [r.identifier, r.radius])).toEqual([["s1", 250], ["s2", 250]]);
    // the payload must be written before the geofences can fire
    expect(m.setItem.mock.invocationCallOrder[0]).toBeLessThan(m.start.mock.invocationCallOrder[0]);
  });

  it("no stores in range: stops geofencing and writes nothing", async () => {
    m.fetchCompare.mockResolvedValue({ stores: [], unmatched: ["1"] });
    const { syncGeofences } = await load();
    await syncGeofences(coords, { items: [{ code: "1", quantity: 1 }], groups: [] });
    expect(m.stop).toHaveBeenCalled();
    expect(m.setItem).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it("caps armed regions at 20 even if the API returns more", async () => {
    m.fetchCompare.mockResolvedValue({ stores: Array.from({ length: 30 }, (_, i) => store(`s${i}`, i)), unmatched: [] });
    const { syncGeofences } = await load();
    await syncGeofences(coords, { items: [{ code: "1", quantity: 1 }], groups: [] });
    expect(m.start.mock.calls[0][1]).toHaveLength(20);
  });

  it("API failure rejects without touching existing geofences", async () => {
    m.fetchCompare.mockRejectedValue(new Error("500"));
    const { syncGeofences } = await load();
    await expect(syncGeofences(coords, { items: [{ code: "1", quantity: 1 }], groups: [] })).rejects.toThrow("500");
    expect(m.stop).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it("nearbyAlertsSupported is true outside Expo Go", async () => {
    expect((await load()).nearbyAlertsSupported).toBe(true);
  });
});
