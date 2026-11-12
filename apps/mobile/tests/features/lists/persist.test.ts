import { MutationObserver, QueryClient, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ Events: {}, track: vi.fn() }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));

import { api } from "@/lib/api";
import { itemEdit, listKeys, registerItemEdits, useRestoring, type Item, type ListDetail } from "@/features/lists/api";
import { createSavedCopy, keepSaved } from "@/features/lists/persist";

// The saved-copy seam: real QueryClients with the item-edit defaults, a fake in-memory storage, the api held by hand.
const item = (id: string): Item => ({
  id, listId: "l", name: id, category: "c", productCode: null, groupRef: null, missing: true, quantity: 1, soldBy: "unit", createdAt: "", updatedAt: "",
});
const detail = (items: Item[]) => ({ list: {}, members: [], items }) as unknown as ListDetail;

const fakeStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => void data.set(k, v),
    removeItem: async (k: string) => void data.delete(k),
  };
};
const savedState = (s: ReturnType<typeof fakeStorage>) => JSON.parse(s.data.values().next().value!);

type Call = { method: string; path: string; ok: (v: unknown) => void };
let calls: Call[];
const sent = () => calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);
const tick = () => new Promise((r) => setTimeout(r, 0));
const newClient = () => {
  const qc = new QueryClient();
  registerItemEdits(qc);
  qc.mount();
  return qc;
};
const tap = (qc: QueryClient, kind: "add" | "update" | "remove", vars: object) =>
  void new MutationObserver(qc, itemEdit(kind, "l")).mutate({ listId: "l", ...vars } as never).catch(() => {});

beforeEach(() => {
  calls = [];
  vi.mocked(api).mockImplementation(((path: string, init?: RequestInit) =>
    new Promise((ok) => calls.push({ method: init?.method ?? "GET", path, ok }))) as never);
});
afterEach(() => onlineManager.setOnline(true));

/** A client for "u1" that went offline with two edits waiting, plus the saved copy it left behind. */
async function offlineWithEdits() {
  const storage = fakeStorage();
  const copy = createSavedCopy(storage, 0);
  const qc = newClient();
  const [stop, restored] = keepSaved(qc, copy, "u1");
  await restored;
  qc.setQueryData(listKeys.all, [{ id: "l" }]);
  qc.setQueryData(listKeys.detail("l"), detail([item("a"), item("b")]));
  qc.setQueryData(listKeys.categories("l"), ["c"]);
  qc.setQueryData(["compare", "l"], { stores: [] });
  qc.setQueryData(["home", "types"], ["dairy"]);
  onlineManager.setOnline(false);
  tap(qc, "update", { id: "a", missing: false });
  tap(qc, "remove", { id: "b" });
  await tick();
  await vi.waitFor(() => expect(savedState(storage).clientState.mutations).toHaveLength(2));
  stop();
  qc.unmount(); // the app is closed: this client no longer sends anything
  return { storage, copy };
}

describe("the saved List copy", () => {
  it("saves only the lists, List detail and categories queries and the item edits still to be sent", async () => {
    const { storage } = await offlineWithEdits();
    const saved = savedState(storage).clientState;
    expect(saved.queries.map((q: { queryKey: unknown[] }) => q.queryKey)).toEqual([["lists"], ["lists", "l"], ["lists", "l", "categories"]]);
    expect(saved.mutations.map((m: { mutationKey: unknown[] }) => m.mutationKey)).toEqual([["items", "update"], ["items", "remove"]]);
  });

  it("restores into a fresh client, shows the List at once and sends the queued edits in order once online", async () => {
    const { copy } = await offlineWithEdits();
    const fresh = newClient();
    await keepSaved(fresh, copy, "u1")[1];
    expect(fresh.getQueryData<ListDetail>(listKeys.detail("l"))!.items.map((i) => [i.id, i.missing])).toEqual([["a", false]]);
    expect(fresh.getQueryData(["compare", "l"])).toBeUndefined();
    expect(sent()).toEqual([]);
    onlineManager.setOnline(true);
    await tick();
    expect(sent()).toEqual(["PATCH api/lists/l/items/a"]);
    calls[0]!.ok(item("a"));
    await tick();
    expect(sent()).toEqual(["PATCH api/lists/l/items/a", "DELETE api/lists/l/items/b"]);
  });

  it("resumes an edit that was in flight when the app was closed", async () => {
    const storage = fakeStorage();
    const copy = createSavedCopy(storage, 0);
    const qc = newClient();
    const [stop, restored] = keepSaved(qc, copy, "u1");
    await restored;
    qc.setQueryData(listKeys.detail("l"), detail([item("a")]));
    tap(qc, "update", { id: "a", missing: false }); // online: sent at once, no answer yet
    await tick();
    await vi.waitFor(() => expect(savedState(storage).clientState.mutations).toHaveLength(1));
    stop();
    calls = [];
    await keepSaved(newClient(), copy, "u1")[1];
    await tick();
    expect(sent()).toEqual(["PATCH api/lists/l/items/a"]);
  });

  it("throws away a copy saved for another User", async () => {
    const { storage, copy } = await offlineWithEdits();
    const fresh = newClient();
    await keepSaved(fresh, copy, "u2")[1];
    expect(fresh.getQueryData(listKeys.detail("l"))).toBeUndefined();
    expect(fresh.getMutationCache().getAll()).toHaveLength(0);
    expect(storage.data.size).toBe(0);
  });

  it("throws away a copy older than 30 days", async () => {
    const { storage, copy } = await offlineWithEdits();
    const saved = savedState(storage);
    saved.timestamp -= 31 * 24 * 60 * 60 * 1000;
    storage.data.set(storage.data.keys().next().value!, JSON.stringify(saved));
    const fresh = newClient();
    await keepSaved(fresh, copy, "u1")[1];
    expect(fresh.getQueryData(listKeys.detail("l"))).toBeUndefined();
  });

  it("still sends the queued edits of a copy older than 30 days, but drops its queries", async () => {
    const { storage, copy } = await offlineWithEdits();
    const saved = savedState(storage);
    saved.timestamp -= 31 * 24 * 60 * 60 * 1000;
    storage.data.set(storage.data.keys().next().value!, JSON.stringify(saved));
    const fresh = newClient();
    await keepSaved(fresh, copy, "u1")[1];
    expect(fresh.getQueryData(listKeys.detail("l"))).toBeUndefined();
    expect(fresh.getMutationCache().getAll()).toHaveLength(2);
    onlineManager.setOnline(true);
    await tick();
    expect(sent()).toEqual(["PATCH api/lists/l/items/a"]);
  });

  it("wipes the memory and the queue when another User signs in without a Sign out, and saves nothing of the first under the second", async () => {
    const storage = fakeStorage();
    const copy = createSavedCopy(storage, 0);
    const qc = newClient();
    const [stopA, restoredA] = keepSaved(qc, copy, "u1");
    await restoredA;
    onlineManager.setOnline(false);
    qc.setQueryData(listKeys.detail("l"), detail([item("a")]));
    tap(qc, "update", { id: "a", missing: false });
    await vi.waitFor(() => expect(savedState(storage).clientState.mutations).toHaveLength(1));
    stopA(); // the session ended; nobody signed out
    await keepSaved(qc, copy, "u2")[1];
    expect(qc.getQueryData(listKeys.detail("l"))).toBeUndefined();
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    qc.setQueryData(listKeys.detail("m"), detail([item("b")]));
    await vi.waitFor(() => expect(savedState(storage).buster).toBe("u2"));
    const saved = savedState(storage).clientState;
    expect(saved.queries.map((q: { queryKey: unknown[] }) => q.queryKey)).toEqual([["lists", "m"]]);
    expect(saved.mutations).toEqual([]);
  });

  it("holds List reads until the copy is back, and again for the next sign-in", async () => {
    const { copy } = await offlineWithEdits();
    const fresh = newClient();
    const [stop, restored] = keepSaved(fresh, copy, "u1");
    expect(useRestoring.getState().restoring).toBe(true);
    await restored;
    expect(useRestoring.getState().restoring).toBe(false);
    stop();
    keepSaved(fresh, copy, "u1");
    expect(useRestoring.getState().restoring).toBe(true);
  });

  it("keeps a List's queries in memory while no screen shows it, so they stay in the copy", () => {
    const qc = newClient();
    keepSaved(qc, createSavedCopy(fakeStorage(), 0), "u1");
    expect(qc.getQueryDefaults(listKeys.detail("l")).gcTime).toBe(Infinity);
    expect(qc.getQueryDefaults(["compare", "l"]).gcTime).toBeUndefined();
  });

  it("is emptied with the cache and the queue when the phone is wiped, and a save already waiting does not bring it back", async () => {
    const storage = fakeStorage();
    const copy = createSavedCopy(storage, 50);
    const qc = newClient();
    await keepSaved(qc, copy, "u1")[1];
    onlineManager.setOnline(false);
    qc.setQueryData(listKeys.detail("l"), detail([item("a")]));
    tap(qc, "update", { id: "a", missing: false });
    await vi.waitFor(() => expect(storage.data.size).toBe(1));
    tap(qc, "remove", { id: "a" }); // a newer save is now waiting on the throttle
    await tick();
    await copy.wipe(qc);
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(storage.data.size).toBe(0);
    await new Promise((r) => setTimeout(r, 120));
    expect(storage.data.size).toBe(0);
  });
});
