import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchCompare: vi.fn(),
  currentLocation: vi.fn(),
  hasStarted: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  setItem: vi.fn(),
  deleteItem: vi.fn(),
  getItem: vi.fn(),
  schedule: vi.fn(),
  track: vi.fn(),
  flush: vi.fn(),
  enabled: "1" as string | null,
}));

vi.mock("@/features/compare/api", () => ({ fetchCompare: m.fetchCompare }));
vi.mock("@/lib/location", () => ({ currentLocation: m.currentLocation }));
vi.mock("@/lib/api", () => ({ api: vi.fn() })); // the lists data layer (basketSize) imports it
vi.mock("@/lib/analytics", () => ({ Events: { geofenceTriggered: "geofence_triggered" }, track: m.track, flush: m.flush }));
vi.mock("@/lib/strings", () => ({
  t: (k: string) =>
    ({ "nearby.title": "{store} is cheapest", "nearby.body": "₪{total} · {distance} away", "compare.m": "{m} m", "compare.km": "{km} km" })[k] ?? k,
}));
vi.mock("expo-notifications", () => ({ scheduleNotificationAsync: m.schedule }));
vi.mock("expo-secure-store", () => ({
  getItem: () => m.enabled,
  getItemAsync: m.getItem,
  setItemAsync: m.setItem,
  deleteItemAsync: m.deleteItem,
}));
vi.mock("expo-location", () => ({
  hasStartedGeofencingAsync: m.hasStarted,
  stopGeofencingAsync: m.stop,
  startGeofencingAsync: m.start,
}));

const basket = { items: [{ code: "111", quantity: 2 }], groups: [{ ref: "g|kg", quantity: 1 }] };
const empty = JSON.stringify({ items: [], groups: [] });
const here = { lat: 32.08, lng: 34.78 };
const store = (id: string, o: object = {}) => ({ storeId: id, chainName: "Chain", storeName: id, total: 10.5, matched: 2, distanceKm: 0.35, lat: 32, lng: 34, ...o });

async function load(enabled: string | null = "1") {
  vi.resetModules();
  m.enabled = enabled;
  return import("@/features/geofence/nearbyAlert");
}

beforeEach(() => {
  vi.resetAllMocks();
  m.flush.mockResolvedValue(undefined);
  m.hasStarted.mockResolvedValue(true);
  m.getItem.mockResolvedValue(JSON.stringify(basket));
  m.currentLocation.mockResolvedValue(here);
  m.fetchCompare.mockResolvedValue({ stores: [store("s1")], unmatched: [] });
});

describe("saveBasket", () => {
  it("keeps a copy of the basket", async () => {
    const { saveBasket } = await load();
    await saveBasket(basket);
    expect(m.setItem).toHaveBeenCalledWith("nearbyBasket", JSON.stringify(basket));
  });

  it("stores nothing while alerts are off", async () => {
    const { saveBasket } = await load("0");
    await saveBasket(basket);
    expect(m.setItem).not.toHaveBeenCalled();
  });
});

describe("armNearbyAlerts", () => {
  it("fences the 20 nearest stores at 2 km, from Compare sorted by distance around the current position", async () => {
    m.fetchCompare.mockResolvedValue({ stores: Array.from({ length: 25 }, (_, i) => store(`s${i}`)), unmatched: [] });
    const { armNearbyAlerts } = await load();
    await armNearbyAlerts();
    expect(m.fetchCompare).toHaveBeenCalledWith({ ...here, radiusKm: 20, ...basket, sort: "distance", limit: 20 });
    const [task, regions] = m.start.mock.calls[0];
    expect(task).toBe("grocer-geofence");
    expect(regions).toHaveLength(20);
    expect(regions[0]).toMatchObject({ identifier: "s0", latitude: 32, longitude: 34, radius: 2000, notifyOnEnter: true });
  });

  it("does nothing when alerts are off", async () => {
    const { armNearbyAlerts } = await load("0");
    await armNearbyAlerts();
    expect(m.fetchCompare).not.toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it("stops fencing for an empty or missing basket without calling Compare", async () => {
    const { armNearbyAlerts } = await load();
    for (const stored of [empty, null]) {
      m.getItem.mockResolvedValue(stored);
      await armNearbyAlerts();
    }
    expect(m.stop).toHaveBeenCalledTimes(2);
    expect(m.fetchCompare).not.toHaveBeenCalled();
  });

  it("keeps the old fences without a fix", async () => {
    m.currentLocation.mockResolvedValue(null);
    const { armNearbyAlerts } = await load();
    await armNearbyAlerts();
    expect(m.start).not.toHaveBeenCalled();
    expect(m.stop).not.toHaveBeenCalled();
  });

  it("stops fencing when no store is in range", async () => {
    m.fetchCompare.mockResolvedValue({ stores: [], unmatched: [] });
    const { armNearbyAlerts } = await load();
    await armNearbyAlerts();
    expect(m.stop).toHaveBeenCalled();
    expect(m.start).not.toHaveBeenCalled();
  });

  it("an arm still running when alerts are turned off undoes itself", async () => {
    let respond!: (v: unknown) => void;
    m.fetchCompare.mockReturnValue(new Promise((r) => (respond = r)));
    const { armNearbyAlerts, disableNearbyAlerts } = await load();
    const arm = armNearbyAlerts();
    await vi.waitFor(() => expect(m.fetchCompare).toHaveBeenCalled());
    await disableNearbyAlerts();
    respond({ stores: [store("s1")], unmatched: [] });
    await arm;
    expect(Math.max(...m.stop.mock.invocationCallOrder)).toBeGreaterThan(Math.max(...m.start.mock.invocationCallOrder));
    expect(m.setItem).toHaveBeenLastCalledWith("nearbyAlertsEnabled", "0");
  });
});

describe("onFenceEntered", () => {
  it("alerts for the first store in price order within 2 km of the fresh fix", async () => {
    const { onFenceEntered } = await load();
    await onFenceEntered();
    expect(m.fetchCompare).toHaveBeenCalledWith({ ...here, radiusKm: 2, ...basket, sort: "price", limit: 1 });
    expect(m.schedule).toHaveBeenCalledWith({
      content: {
        title: "Chain s1 is cheapest",
        body: "₪10.50 · 350 m away",
        data: { storeId: "s1", lat: 32, lng: 34 },
        categoryIdentifier: "nearby",
      },
      trigger: null,
    });
    expect(m.track).toHaveBeenCalledWith("geofence_triggered", { storeId: "s1" });
  });

  it.each([
    ["alerts are off", () => load("0")],
    ["the basket is empty", () => (m.getItem.mockResolvedValue(empty), load())],
    ["there is no fix", () => (m.currentLocation.mockResolvedValue(null), load())],
    ["offline", () => (m.fetchCompare.mockRejectedValue(new Error("offline")), load())],
    ["no store is in range", () => (m.fetchCompare.mockResolvedValue({ stores: [], unmatched: [] }), load())],
    ["nothing is priced", () => (m.fetchCompare.mockResolvedValue({ stores: [store("s1", { matched: 0 })], unmatched: [] }), load())],
  ])("no alert when %s", async (_, setup) => {
    const { onFenceEntered } = await setup();
    await expect(onFenceEntered()).resolves.toBeUndefined();
    expect(m.schedule).not.toHaveBeenCalled();
    expect(m.track).not.toHaveBeenCalled();
  });
});

describe("disableNearbyAlerts", () => {
  it("stops fences and deletes the basket copy and the setting", async () => {
    const { disableNearbyAlerts } = await load();
    await disableNearbyAlerts();
    expect(m.stop).toHaveBeenCalledWith("grocer-geofence");
    expect(m.deleteItem).toHaveBeenCalledWith("nearbyBasket");
    expect(m.setItem).toHaveBeenCalledWith("nearbyAlertsEnabled", "0");
  });

  it("does not stop or throw when never started", async () => {
    m.hasStarted.mockResolvedValue(false);
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).resolves.toBeUndefined();
    expect(m.stop).not.toHaveBeenCalled();
  });

  it("clears the rest and reports the failure when stopping fails", async () => {
    m.stop.mockRejectedValue(new Error("os refused"));
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).rejects.toThrow("os refused");
    expect(m.deleteItem).toHaveBeenCalledWith("nearbyBasket");
    expect(m.setItem).toHaveBeenCalledWith("nearbyAlertsEnabled", "0");
  });

  it("still turns the setting off when deleting the basket fails", async () => {
    m.deleteItem.mockRejectedValue(new Error("keychain"));
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).rejects.toThrow("keychain");
    expect(m.setItem).toHaveBeenCalledWith("nearbyAlertsEnabled", "0");
    expect(m.stop).toHaveBeenCalled();
  });
});
