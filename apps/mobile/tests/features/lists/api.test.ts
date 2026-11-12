import { MutationObserver, QueryClient, QueryObserver, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ Events: {}, track: vi.fn() }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));

import { api } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import {
  basketSize, currentListId, failureOf, itemEdit, itemEditsPending, listDetailOptions, refreshList, listKeys, matchKey, missingBasket, onItemSaveFailed, optimisticItem, reAdd, registerItemEdits,
  type Item, type ListDetail,
} from "@/features/lists/api";

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, listId: "l", name: id, category: "c", productCode: null, groupRef: null, missing: true, quantity: 1, soldBy: "unit", createdAt: "", updatedAt: "", ...over,
});
const detail = (items: Item[]) => ({ list: {}, members: [], items }) as unknown as ListDetail;

describe("matchKey", () => {
  it("is the product code, else the group ref, else null", () => {
    expect(matchKey(item("a", { productCode: "729" }))).toBe("729");
    expect(matchKey(item("b", { groupRef: "בורגול|kg" }))).toBe("בורגול|kg");
    expect(matchKey(item("c"))).toBeNull();
  });
});

describe("missingBasket", () => {
  it("sends missing items matched to a product as items and matched to a group as groups, each with its quantity", () => {
    const d = detail([
      item("a", { productCode: "111", quantity: 2 }),
      item("b", { groupRef: "בורגול|kg" }),
      item("c", { groupRef: "בננה|kg", quantity: 1.5, soldBy: "weight" }),
      item("d", { productCode: "222" }),
    ]);
    expect(missingBasket(d)).toEqual({
      items: [{ code: "111", quantity: 2 }, { code: "222", quantity: 1 }],
      groups: [{ ref: "בורגול|kg", quantity: 1 }, { ref: "בננה|kg", quantity: 1.5 }],
    });
  });

  it("keeps two items matched to one product as two entries (the API sums them)", () => {
    const d = detail([item("a", { productCode: "111", quantity: 2 }), item("b", { productCode: "111", quantity: 3 })]);
    expect(missingBasket(d).items).toEqual([{ code: "111", quantity: 2 }, { code: "111", quantity: 3 }]);
  });

  it("leaves out items already bought and items matched to nothing", () => {
    const d = detail([item("a", { productCode: "111", missing: false }), item("b", { groupRef: "בורגול|kg", missing: false }), item("c")]);
    expect(missingBasket(d)).toEqual({ items: [], groups: [] });
  });

  it("is empty without a list", () => {
    expect(missingBasket(undefined)).toEqual({ items: [], groups: [] });
  });
});

describe("basketSize", () => {
  it("counts items and groups together", () => {
    const one = (code: string) => ({ code, quantity: 1 });
    expect(basketSize({ items: [], groups: [] })).toBe(0);
    expect(basketSize({ items: [one("1"), one("2")], groups: [{ ref: "g|kg", quantity: 2 }] })).toBe(3);
    expect(basketSize({ items: [], groups: [{ ref: "g|kg", quantity: 1 }] })).toBe(1);
  });
});

describe("currentListId", () => {
  const lists = [{ id: "a" }, { id: "b" }];
  it("keeps the stored pick while it is still one of the lists", () => {
    expect(currentListId("b", lists)).toBe("b");
  });
  it("falls back to the first list when the pick was left or removed, or nothing is stored", () => {
    expect(currentListId("gone", lists)).toBe("a");
    expect(currentListId(null, lists)).toBe("a");
    expect(currentListId("gone", [])).toBeNull();
  });
  it("trusts the stored pick until the lists load", () => {
    expect(currentListId("b", undefined)).toBe("b");
  });
});

describe("reAdd", () => {
  it("is Undo: the same id and every field, Quantity included", () => {
    const gone = item("g", { name: "Eggs", category: "Dairy", productCode: "729", quantity: 6, missing: false, soldBy: "weight" });
    expect(reAdd(gone)).toEqual({ id: "g", name: "Eggs", category: "Dairy", productCode: "729", groupRef: null, missing: false, quantity: 6, soldBy: "weight" });
  });
});

describe("failureOf", () => {
  it("sorts the error by what the item edit should do next", () => {
    expect(failureOf(new TypeError("Network request failed"))).toBe("network");
    expect(failureOf(new DOMException("timed out", "AbortError"))).toBe("network");
    expect(failureOf(new ApiError("x", 503))).toBe("retry");
    expect(failureOf(new ApiError("x", 404))).toBe("gone");
    expect(failureOf(new ApiError("x", 422))).toBe("undo");
  });
});

describe("optimisticItem", () => {
  it("shows a new item at once with what was sent, and the API's defaults for the rest", () => {
    expect(optimisticItem({ id: "n1", name: "חלב", category: "אחר", groupRef: "חלב|l", quantity: 2, soldBy: "unit" }, "l", "now")).toMatchObject({
      id: "n1", listId: "l", name: "חלב", category: "אחר", groupRef: "חלב|l", productCode: null, missing: true, quantity: 2, soldBy: "unit",
    });
    expect(optimisticItem({ id: "n2", name: "x", category: "y", missing: false }, "l", "now")).toMatchObject({ missing: false, quantity: 1, soldBy: "unit" });
  });

  it("shows the row under the id the phone made", () => {
    expect(optimisticItem({ id: "n3", name: "x", category: "y" }, "l", "now").id).toBe("n3");
  });
});

// The item-edit seam: a real QueryClient with the defaults registered, edits driven through MutationObservers, the api held by hand.
describe("item edits", () => {
  type Call = { method: string; path: string; ok: (v: unknown) => void; fail: (e: Error) => void };
  let calls: Call[];
  let qc: QueryClient;
  const tick = () => (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(0) : new Promise((r) => setTimeout(r, 0)));
  const key = listKeys.detail("l");
  const items = () => qc.getQueryData<ListDetail>(key)!.items;
  const state = () => Object.fromEntries(items().map((i) => [i.id, i.missing]));
  const sent = () => calls.filter((c) => c.method !== "GET");
  const gets = () => calls.filter((c) => c.method === "GET").length;
  /** Taps an edit; resolves when it settles (failed edits resolve too, the assertions read the cache). */
  const tap = async (kind: "add" | "update" | "remove", vars: object) => {
    void new MutationObserver(qc, itemEdit(kind, "l")).mutate({ listId: "l", ...vars } as never).catch(() => {});
    await tick();
  };

  beforeEach(() => {
    calls = [];
    vi.mocked(api).mockImplementation(((path: string, init?: RequestInit) =>
      new Promise((ok, fail) => calls.push({ method: init?.method ?? "GET", path, ok, fail }))) as never);
    qc = new QueryClient();
    registerItemEdits(qc);
    qc.mount(); // the provider does this in the app: it sends paused edits once the phone is back online
    qc.setQueryData(key, detail([item("a"), item("b"), item("c")]));
  });
  afterEach(() => {
    qc.unmount();
    vi.useRealTimers();
  });

  it("shows quick toggles of different items at once and never an old state", async () => {
    void tap("update", { id: "a", missing: false });
    void tap("update", { id: "b", missing: false });
    await tap("update", { id: "c", missing: false });
    expect(state()).toEqual({ a: false, b: false, c: false });
    expect(sent().map((c) => c.path)).toEqual(["api/lists/l/items/a"]); // one at a time, in tap order
    calls[0]!.ok(item("a", { missing: false }));
    await tick();
    expect(state()).toEqual({ a: false, b: false, c: false });
    expect(sent().map((c) => c.path)).toEqual(["api/lists/l/items/a", "api/lists/l/items/b"]);
  });

  it("ends a toggle and its reverse at the second tap, even when the first reply arrives later", async () => {
    void tap("update", { id: "a", missing: false });
    await tap("update", { id: "a", missing: true });
    expect(state().a).toBe(true);
    calls[0]!.ok(item("a", { missing: false }));
    await tick();
    expect(state().a).toBe(true);
    calls[1]!.ok(item("a", { missing: true }));
    await tick();
    expect(state().a).toBe(true);
  });

  it("takes only soldBy, and quantity when a re-match reset it, from the server's reply", async () => {
    await tap("update", { id: "a", productCode: "729" });
    calls[0]!.ok(item("a", { productCode: "729", soldBy: "weight", quantity: 0.5 }));
    await tick();
    expect(items()[0]).toMatchObject({ soldBy: "weight", quantity: 0.5 });

    void tap("update", { id: "b", productCode: "729" });
    await tap("update", { id: "b", quantity: 4 });
    calls[1]!.ok(item("b", { productCode: "729", soldBy: "weight", quantity: 1 }));
    await tick();
    expect(items()[1]).toMatchObject({ soldBy: "weight", quantity: 4 }); // the later queued edit's quantity stays
  });

  it("undoes only the failed item: an update gets its field back, a delete comes back, an add goes", async () => {
    void tap("update", { id: "a", missing: false });
    void tap("update", { id: "b", missing: false });
    void tap("remove", { id: "c" });
    await tap("add", { id: "n", name: "new", category: "c" });
    expect(items().map((i) => i.id)).toEqual(["a", "b", "n"]); // c is gone
    calls[0]!.fail(new ApiError("422", 422));
    await tick();
    expect(state()).toMatchObject({ a: true, b: false });
    calls[1]!.ok(item("b", { missing: false }));
    await tick();
    calls[2]!.fail(new ApiError("422", 422)); // the delete
    await tick();
    expect(items().map((i) => i.id)).toEqual(["a", "b", "c", "n"]);
    calls[3]!.fail(new ApiError("422", 422)); // the add
    await tick();
    expect(items().map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(state()).toEqual({ a: true, b: false, c: true });
  });

  it("sends the phone-made id, keeps the row under it, and lets a later edit of the new item use it at once", async () => {
    void tap("add", { id: "n", name: "new", category: "c", quantity: 3 });
    await tap("update", { id: "n", missing: false });
    expect(JSON.parse(String((vi.mocked(api).mock.calls[0]![1] as RequestInit).body))).toMatchObject({ id: "n", name: "new", quantity: 3 });
    expect(items().at(-1)).toMatchObject({ id: "n", missing: false });
    calls[0]!.ok(item("n", { name: "new", quantity: 3, createdAt: "t" }));
    await tick();
    expect(items().map((i) => i.id)).toEqual(["a", "b", "c", "n"]);
    expect(sent().map((c) => c.path)).toEqual(["api/lists/l/items", "api/lists/l/items/n"]);
  });

  it("keeps a poll answer that arrives while an edit is in flight from overwriting it, then refetches once", async () => {
    const watcher = new QueryObserver(qc, { ...listDetailOptions("l"), staleTime: Infinity });
    const stop = watcher.subscribe(() => {});
    void watcher.refetch(); // a poll is in flight
    await tick();
    expect(gets()).toBe(1);
    void tap("update", { id: "a", missing: false });
    void tap("update", { id: "b", missing: false });
    await tick();
    calls[0]!.ok(detail([item("a"), item("b"), item("c")])); // the stale answer
    await tick();
    expect(state()).toEqual({ a: false, b: false, c: true });
    calls[1]!.ok(item("a", { missing: false }));
    await tick();
    expect(gets()).toBe(1); // no refetch while b is still to go
    calls[2]!.ok(item("b", { missing: false }));
    await tick();
    expect(gets()).toBe(2); // exactly one, after the last
    stop();
  });

  describe("when the phone is offline", () => {
    afterEach(() => onlineManager.setOnline(true));
    const goOnline = async () => {
      onlineManager.setOnline(true);
      await tick();
    };

    it("shows edits at once, sends nothing, then sends them in tap order once back online", async () => {
      onlineManager.setOnline(false);
      void tap("update", { id: "a", missing: false });
      void tap("remove", { id: "b" });
      await tap("add", { id: "n", name: "new", category: "c" });
      expect(items().map((i) => i.id)).toEqual(["a", "c", "n"]);
      expect(state().a).toBe(false);
      expect(sent()).toHaveLength(0);
      await goOnline();
      expect(sent().map((c) => c.path)).toEqual(["api/lists/l/items/a"]);
      calls[0]!.ok(item("a", { missing: false }));
      await tick();
      calls[1]!.ok(undefined);
      await tick();
      expect(sent().map((c) => `${c.method} ${c.path}`)).toEqual(["PATCH api/lists/l/items/a", "DELETE api/lists/l/items/b", "POST api/lists/l/items"]);
    });

    it("lets a new item be changed and checked off while still offline, then creates it before changing it", async () => {
      onlineManager.setOnline(false);
      void tap("add", { id: "n", name: "new", category: "c" });
      void tap("update", { id: "n", quantity: 3 });
      await tap("update", { id: "n", missing: false });
      expect(items().at(-1)).toMatchObject({ id: "n", quantity: 3, missing: false });
      await goOnline();
      expect(sent().map((c) => `${c.method} ${c.path}`)).toEqual(["POST api/lists/l/items"]);
      calls[0]!.ok(item("n", { name: "new" }));
      await tick();
      calls[1]!.ok(item("n", { quantity: 3 }));
      await tick();
      expect(sent().map((c) => `${c.method} ${c.path}`)).toEqual(["POST api/lists/l/items", "PATCH api/lists/l/items/n", "PATCH api/lists/l/items/n"]);
      expect(items().at(-1)).toMatchObject({ quantity: 3, missing: false });
    });

    it("holds off refetches while edits wait, then refetches after the last one", async () => {
      const watcher = new QueryObserver(qc, listDetailOptions("l")); // stale at once, so it refetches on reconnect
      const stop = watcher.subscribe(() => {});
      await tick();
      calls[0]!.ok(detail([item("a"), item("b"), item("c")]));
      await tick();
      calls.length = 0;
      onlineManager.setOnline(false);
      void tap("update", { id: "a", missing: false });
      await tap("update", { id: "b", missing: false });
      expect(itemEditsPending(qc, "l")).toBe(2); // paused edits count
      await goOnline();
      expect(gets()).toBe(0); // reconnecting does not refetch while edits go out
      calls[0]!.ok(item("a", { missing: false }));
      await tick();
      expect(gets()).toBe(0);
      calls[1]!.ok(item("b", { missing: false }));
      await tick();
      expect(gets()).toBeGreaterThan(0); // the List catches up once the last edit has gone
      stop();
    });

    it("skips a pull-to-refresh of a List with edits pending, and refreshes once nothing is queued", async () => {
      const watcher = new QueryObserver(qc, listDetailOptions("l"));
      const stop = watcher.subscribe(() => {});
      await tick();
      calls[0]!.ok(detail([item("a")]));
      await tick();
      calls.length = 0;
      await tap("update", { id: "a", missing: false });
      await refreshList(qc, "l", () => watcher.refetch());
      expect(gets()).toBe(0);
      calls[0]!.ok(item("a", { missing: false }));
      await tick();
      calls.find((c) => c.method === "GET")!.ok(detail([item("a", { missing: false })])); // the last edit's own refetch
      await tick();
      calls.length = 0;
      void refreshList(qc, "l", () => watcher.refetch());
      await tick();
      expect(gets()).toBe(1);
      stop();
    });

    it("pauses an edit whose request never got a response, and sends it again once back online", async () => {
      vi.useFakeTimers();
      await tap("update", { id: "a", missing: false });
      onlineManager.setOnline(false);
      calls[0]!.fail(new TypeError("Network request failed"));
      await tick();
      expect(sent()).toHaveLength(1);
      expect(state().a).toBe(false); // still as tapped, no undo
      await goOnline();
      await vi.advanceTimersByTimeAsync(1000); // its backoff
      expect(sent()).toHaveLength(2);
    });

    it("keeps retrying a request that gets no response, with backoff capped at 30s, never undoing or toasting", async () => {
      vi.useFakeTimers();
      const toasts: string[] = [];
      onItemSaveFailed(qc, (name) => toasts.push(name));
      await tap("update", { id: "a", missing: false });
      for (let n = 1; n <= 8; n++) {
        calls.at(-1)!.fail(new TypeError("Network request failed"));
        await vi.advanceTimersByTimeAsync(Math.min(1000 * 2 ** (n - 1), 30_000));
        expect(sent()).toHaveLength(n + 1);
      }
      expect(state().a).toBe(false);
      expect(toasts).toEqual([]);
    });

    it("aborts a request that hangs, so it counts as a network error", async () => {
      vi.useFakeTimers();
      await tap("update", { id: "a", missing: false });
      const signal = (vi.mocked(api).mock.calls[0]![1] as RequestInit).signal!;
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(signal.aborted).toBe(true);
    });
  });

  describe("when the server fails", () => {
    const failWith = (status: number) => new ApiError(`${status}`, status);
    const toasts: string[] = [];
    beforeEach(() => {
      toasts.length = 0;
      onItemSaveFailed(qc, (name) => toasts.push(name));
    });

    it("retries a 5xx three times with backoff, then undoes only that item and raises the toast", async () => {
      vi.useFakeTimers();
      void tap("update", { id: "a", missing: false });
      await tap("update", { id: "b", missing: false });
      calls[0]!.fail(failWith(503));
      await vi.advanceTimersByTimeAsync(999);
      expect(sent()).toHaveLength(1); // backing off
      await vi.advanceTimersByTimeAsync(1);
      calls.at(-1)!.fail(failWith(503));
      await vi.advanceTimersByTimeAsync(2000);
      calls.at(-1)!.fail(failWith(503));
      await vi.advanceTimersByTimeAsync(4000);
      calls.at(-1)!.fail(failWith(503));
      await tick();
      expect(sent().slice(0, 4).map((c) => c.path)).toEqual(Array(4).fill("api/lists/l/items/a")); // the first try and three retries
      expect(state()).toEqual({ a: true, b: false, c: true }); // only a went back
      expect(toasts).toEqual(["a"]);
      expect(sent().at(-1)!.path).toBe("api/lists/l/items/b"); // the queue moves on
    });

    it("does not retry another 4xx: the item is undone and the toast shows", async () => {
      await tap("update", { id: "a", missing: false });
      calls[0]!.fail(failWith(422));
      await tick();
      expect(sent()).toHaveLength(1);
      expect(state().a).toBe(true);
      expect(toasts).toEqual(["a"]);
    });

    it("counts a 404 on a delete as done: no undo, no toast", async () => {
      await tap("remove", { id: "c" });
      calls[0]!.fail(failWith(404));
      await tick();
      expect(items().map((i) => i.id)).toEqual(["a", "b"]);
      expect(toasts).toEqual([]);
    });

    it("drops a 404 on an update silently and refetches the List", async () => {
      const watcher = new QueryObserver(qc, { ...listDetailOptions("l"), staleTime: Infinity });
      const stop = watcher.subscribe(() => {});
      await tick();
      calls.length = 0;
      await tap("update", { id: "a", missing: false });
      calls[0]!.fail(failWith(404));
      await tick();
      expect(toasts).toEqual([]);
      expect(sent()).toHaveLength(1); // not retried
      expect(gets()).toBe(1); // refetched
      calls[1]!.ok(detail([item("b"), item("c")])); // the spouse deleted a
      await tick();
      expect(items().map((i) => i.id)).toEqual(["b", "c"]);
      stop();
    });

    it("drops a 404 on an add silently: the pending row goes, no toast", async () => {
      await tap("add", { id: "n", name: "new", category: "c" });
      calls[0]!.fail(failWith(404));
      await tick();
      expect(items().map((i) => i.id)).toEqual(["a", "b", "c"]);
      expect(toasts).toEqual([]);
    });
  });
});
