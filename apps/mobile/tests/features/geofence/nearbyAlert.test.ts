import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fetchCompare: vi.fn(),
  currentLocation: vi.fn(),
  currentFix: vi.fn(),
  hasStarted: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  hasMoves: vi.fn(),
  stopMoves: vi.fn(),
  startMoves: vi.fn(),
  setItem: vi.fn(),
  deleteItem: vi.fn(),
  getItem: vi.fn(),
  schedule: vi.fn(),
  track: vi.fn(),
  flush: vi.fn(),
  enabled: "1" as string | null,
}));

vi.mock("@/features/compare/api", () => ({ fetchCompare: m.fetchCompare }));
vi.mock("@/lib/location", () => ({ currentLocation: m.currentLocation, currentFix: m.currentFix }));
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
  hasStartedLocationUpdatesAsync: m.hasMoves,
  stopLocationUpdatesAsync: m.stopMoves,
  startLocationUpdatesAsync: m.startMoves,
  Accuracy: { Balanced: 3 },
  ActivityType: { Other: 1 },
}));

const basket = { items: [{ code: "111", quantity: 2 }], groups: [{ ref: "g|kg", quantity: 1 }] };
const empty = JSON.stringify({ items: [], groups: [] });
const here = { lat: 32.08, lng: 34.78 };
const fix = (speedKmh: number | null = null) => ({ ...here, speedKmh });
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => vi.setSystemTime(new Date(y, mo - 1, d, h, mi));
const store = (id: string, o: object = {}) => ({ storeId: id, chainName: "Chain", storeName: id, total: 10.5, matched: 2, distanceKm: 0.35, lat: 32, lng: 34, ...o });

async function load(enabled: string | null = "1") {
  vi.resetModules();
  m.enabled = enabled;
  return import("@/features/geofence/nearbyAlert");
}

const kv = new Map<string, string>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  at(2026, 11, 18); // a Wednesday noon
  kv.clear();
  m.setItem.mockImplementation(async (k: string, v: string) => void kv.set(k, v));
  m.flush.mockResolvedValue(undefined);
  m.hasStarted.mockResolvedValue(true);
  m.hasMoves.mockResolvedValue(false);
  m.getItem.mockImplementation(async (k: string) => (k === "nearbyBasket" ? JSON.stringify(basket) : (kv.get(k) ?? null)));
  m.currentLocation.mockResolvedValue(here);
  m.currentFix.mockResolvedValue(fix());
  m.fetchCompare.mockResolvedValue({ stores: [store("s1")], unmatched: [] });
});

afterEach(() => vi.useRealTimers());

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

describe("background re-arm", () => {
  it("starts low-power location updates every 5 km once fences are set", async () => {
    const { armNearbyAlerts } = await load();
    await armNearbyAlerts();
    expect(m.startMoves).toHaveBeenCalledWith("grocer-nearby-move", expect.objectContaining({ accuracy: 3, distanceInterval: 5000 }));
    expect(m.startMoves.mock.calls[0][1].deferredUpdatesDistance).toBe(5000);
  });

  it("does not restart updates already running", async () => {
    m.hasMoves.mockResolvedValue(true);
    const { armNearbyAlerts } = await load();
    await armNearbyAlerts();
    expect(m.startMoves).not.toHaveBeenCalled();
  });

  it("stops updates and fences for an empty basket", async () => {
    m.hasMoves.mockResolvedValue(true);
    m.getItem.mockResolvedValue(empty);
    const { armNearbyAlerts } = await load();
    await armNearbyAlerts();
    expect(m.stopMoves).toHaveBeenCalledWith("grocer-nearby-move");
    expect(m.stop).toHaveBeenCalled();
  });

  it("an arm still running when alerts are turned off leaves no updates", async () => {
    m.hasMoves.mockResolvedValue(true);
    let respond!: (v: unknown) => void;
    m.fetchCompare.mockReturnValue(new Promise((r) => (respond = r)));
    const { armNearbyAlerts, disableNearbyAlerts } = await load();
    const arm = armNearbyAlerts();
    await vi.waitFor(() => expect(m.fetchCompare).toHaveBeenCalled());
    await disableNearbyAlerts();
    respond({ stores: [store("s1")], unmatched: [] });
    await arm;
    expect(m.stopMoves).toHaveBeenCalledWith("grocer-nearby-move");
    expect(m.startMoves).not.toHaveBeenCalled();
  });

  it("disabling stops the updates even when stopping the fences fails", async () => {
    m.hasMoves.mockResolvedValue(true);
    m.stop.mockRejectedValue(new Error("os refused"));
    const { disableNearbyAlerts } = await load();
    await expect(disableNearbyAlerts()).rejects.toThrow("os refused");
    expect(m.stopMoves).toHaveBeenCalledWith("grocer-nearby-move");
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
    ["there is no fix", () => (m.currentFix.mockResolvedValue(null), load())],
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

describe("onFenceEntered limits", () => {
  const entered = async () => {
    const { onFenceEntered } = await load();
    await onFenceEntered();
    return m.schedule.mock.calls.length;
  };

  it("alerts once per local day, then again the next day", async () => {
    const { onFenceEntered } = await load();
    await onFenceEntered();
    at(2026, 11, 18, 18);
    await onFenceEntered();
    expect(m.schedule).toHaveBeenCalledTimes(1);
    at(2026, 11, 19, 9);
    await onFenceEntered();
    expect(m.schedule).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["06:59", 6, 59, 0],
    ["07:00", 7, 0, 1],
    ["21:59", 21, 59, 1],
    ["22:00", 22, 0, 0],
  ])("night window: %s", async (_, h, mi, n) => {
    at(2026, 11, 18, h, mi);
    expect(await entered()).toBe(n);
  });

  it.each([
    ["Friday 14:59", 20, 14, 59, 1],
    ["Friday 15:00", 20, 15, 0, 0],
    ["Saturday noon", 21, 12, 0, 0],
    ["Sunday 08:59", 22, 8, 59, 0],
    ["Sunday 09:00", 22, 9, 0, 1],
  ])("Shabbat window: %s", async (_, d, h, mi, n) => {
    at(2026, 11, d, h, mi);
    expect(await entered()).toBe(n);
  });

  it.each([
    ["95 km/h", 95, 1],
    ["above 95 km/h", 95.1, 0],
    ["an unknown speed", null, 1],
  ])("speed: %s", async (_, speed, n) => {
    m.currentFix.mockResolvedValue(fix(speed));
    expect(await entered()).toBe(n);
  });

  it("does not fetch a fix on a skipped day or time", async () => {
    at(2026, 11, 18, 23);
    await entered();
    expect(m.currentFix).not.toHaveBeenCalled();
  });

  it("a skip, no fix, offline or nothing priced leaves the day's alert unused", async () => {
    const { onFenceEntered } = await load();
    at(2026, 11, 18, 23);
    await onFenceEntered();
    at(2026, 11, 18, 12);
    m.currentFix.mockResolvedValueOnce(fix(120));
    await onFenceEntered();
    m.currentFix.mockResolvedValueOnce(null);
    await onFenceEntered();
    m.fetchCompare.mockRejectedValueOnce(new Error("offline"));
    await onFenceEntered();
    m.fetchCompare.mockResolvedValueOnce({ stores: [store("s1", { matched: 0 })], unmatched: [] });
    await onFenceEntered();
    expect(m.schedule).not.toHaveBeenCalled();
    await onFenceEntered();
    expect(m.schedule).toHaveBeenCalledTimes(1);
  });

  it("records the day only once the notification is scheduled", async () => {
    m.schedule.mockRejectedValue(new Error("os"));
    const { onFenceEntered } = await load();
    await expect(onFenceEntered()).rejects.toThrow("os");
    expect(kv.size).toBe(0);
  });
});

describe("disableNearbyAlerts", () => {
  it("stops fences and deletes the basket copy and the setting", async () => {
    const { disableNearbyAlerts } = await load();
    await disableNearbyAlerts();
    expect(m.stop).toHaveBeenCalledWith("grocer-geofence");
    expect(m.deleteItem).toHaveBeenCalledWith("nearbyBasket");
    expect(m.deleteItem).toHaveBeenCalledWith("nearbyLastAlert");
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
