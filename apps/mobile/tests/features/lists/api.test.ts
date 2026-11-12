import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ Events: {}, track: vi.fn() }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));

import { api } from "@/lib/api";
import {
  basketSize, currentListId, itemEdit, listDetailOptions, listKeys, matchKey, missingBasket, optimisticItem, registerItemEdits,
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

describe("optimisticItem", () => {
  it("shows a new item at once with what was sent, and the API's defaults for the rest", () => {
    expect(optimisticItem({ name: "חלב", category: "אחר", groupRef: "חלב|l", quantity: 2, soldBy: "unit" }, "l", "now")).toMatchObject({
      listId: "l", name: "חלב", category: "אחר", groupRef: "חלב|l", productCode: null, missing: true, quantity: 2, soldBy: "unit",
    });
    expect(optimisticItem({ name: "x", category: "y", missing: false }, "l", "now")).toMatchObject({ missing: false, quantity: 1, soldBy: "unit" });
  });

  it("gives every pending item its own id", () => {
    const body = { name: "x", category: "y" };
    expect(optimisticItem(body, "l", "now").id).not.toBe(optimisticItem(body, "l", "now").id);
  });
});

// The item-edit seam: a real QueryClient with the defaults registered, edits driven through MutationObservers, the api held by hand.
describe("item edits", () => {
  type Call = { method: string; path: string; ok: (v: unknown) => void; fail: (e: Error) => void };
  let calls: Call[];
  let qc: QueryClient;
  const tick = () => new Promise((r) => setTimeout(r, 0));
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
    qc.setQueryData(key, detail([item("a"), item("b"), item("c")]));
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
    await tap("add", { name: "new", category: "c" });
    expect(items().map((i) => i.id)).toEqual(["a", "b", expect.stringMatching(/^pending-/)]); // c is gone
    calls[0]!.fail(new Error("500"));
    await tick();
    expect(state()).toMatchObject({ a: true, b: false });
    calls[1]!.ok(item("b", { missing: false }));
    await tick();
    calls[2]!.fail(new Error("500")); // the delete
    await tick();
    expect(items().map((i) => i.id)).toEqual(["a", "b", "c", expect.stringMatching(/^pending-/)]);
    calls[3]!.fail(new Error("500")); // the add
    await tick();
    expect(items().map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(state()).toEqual({ a: true, b: false, c: true });
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
});
