import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ api: vi.fn(), alert: vi.fn(), track: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: m.api }));
vi.mock("react-native", () => ({ Alert: { alert: m.alert } }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("@/lib/analytics", () => ({ Events: { listCreated: "list_created" }, track: m.track }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItemAsync: () => Promise.resolve() }));

import { listKeys, useSelectedList, type List, type ListDetail } from "@/features/lists/api";
import { createList, leaveList, renameList } from "@/features/share/api";

const list = (id: string, name: string): List => ({ id, name, ownerId: "u", role: "owner", memberCount: 1, updatedAt: "" });

let qc: QueryClient;
const names = () => ({
  lists: qc.getQueryData<List[]>(listKeys.all)?.map((l) => l.name),
  detail: qc.getQueryData<ListDetail>(listKeys.detail("a"))?.list.name,
});
// Runs the options the way useMutation does, without React.
const rename = (name: string) => new MutationObserver(qc, renameList(qc, "a")).mutate(name).catch(() => {});

beforeEach(() => {
  vi.resetAllMocks();
  qc = new QueryClient();
  qc.setQueryData(listKeys.all, [list("a", "הרשימה שלי"), list("b", "סבתא")]);
  qc.setQueryData<ListDetail>(listKeys.detail("a"), { list: list("a", "הרשימה שלי"), members: [], items: [] });
});

describe("renameList", () => {
  it("PATCHes the List and shows the trimmed name in both caches before the server answers", async () => {
    m.api.mockReturnValue(new Promise(() => {}));
    void rename("  הבית ");
    await vi.waitFor(() => expect(names()).toEqual({ lists: ["הבית", "סבתא"], detail: "הבית" }));
    expect(m.api).toHaveBeenCalledWith("api/lists/a", { method: "PATCH", body: JSON.stringify({ name: "  הבית " }) });
  });

  it("keeps the new name when the save succeeds, with no alert", async () => {
    m.api.mockResolvedValue(list("a", "הבית"));
    await rename("הבית");
    expect(names()).toEqual({ lists: ["הבית", "סבתא"], detail: "הבית" });
    expect(m.alert).not.toHaveBeenCalled();
  });

  it("puts the old name back in both caches and shows the error alert when the save fails", async () => {
    m.api.mockRejectedValue(new Error("500"));
    await rename("הבית");
    expect(names()).toEqual({ lists: ["הרשימה שלי", "סבתא"], detail: "הרשימה שלי" });
    expect(m.alert).toHaveBeenCalledWith("common.error");
  });
});

describe("createList", () => {
  const create = (name: string) => new MutationObserver(qc, createList(qc)).mutate(name).catch(() => {});

  it("POSTs the trimmed name, adds the List to the cache, selects it and tracks it", async () => {
    m.api.mockResolvedValue(list("c", "דירה"));
    await create("  דירה ");
    expect(m.api).toHaveBeenCalledWith("api/lists", { method: "POST", body: JSON.stringify({ name: "דירה" }) });
    expect(qc.getQueryData<List[]>(listKeys.all)?.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(useSelectedList.getState().id).toBe("c");
    expect(m.track).toHaveBeenCalledWith("list_created", { listId: "c" });
  });

  it("shows the error alert and adds, selects and tracks nothing when it fails", async () => {
    useSelectedList.setState({ id: "a" });
    m.api.mockRejectedValue(new Error("500"));
    await create("דירה");
    expect(qc.getQueryData<List[]>(listKeys.all)).toHaveLength(2);
    expect(useSelectedList.getState().id).toBe("a");
    expect(m.alert).toHaveBeenCalledWith("common.error");
    expect(m.track).not.toHaveBeenCalled();
  });
});

describe("leaveList", () => {
  const leave = (id: string) => new MutationObserver(qc, leaveList(qc, id)).mutate("me").catch(() => {});

  it("DELETEs the caller's membership and removes a List that isn't the current one from the cache, with no alert", async () => {
    useSelectedList.setState({ id: "a" });
    m.api.mockResolvedValue(undefined);
    await leave("b");
    expect(m.api).toHaveBeenCalledWith("api/lists/b/members/me", { method: "DELETE" });
    expect(qc.getQueryData<List[]>(listKeys.all)?.map((l) => l.id)).toEqual(["a"]);
    expect(m.alert).not.toHaveBeenCalled();
  });

  it("leaves the cache alone and shows the error alert when it fails", async () => {
    m.api.mockRejectedValue(new Error("500"));
    await leave("b");
    expect(qc.getQueryData<List[]>(listKeys.all)?.map((l) => l.id)).toEqual(["a", "b"]);
    expect(m.alert).toHaveBeenCalledWith("common.error");
  });
});
