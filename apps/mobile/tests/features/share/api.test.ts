import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ api: vi.fn(), alert: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: m.api }));
vi.mock("react-native", () => ({ Alert: { alert: m.alert } }));
vi.mock("@/lib/strings", () => ({ t: (k: string) => k }));
vi.mock("@/lib/analytics", () => ({ Events: {}, track: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItemAsync: vi.fn() }));

import { listKeys, type List, type ListDetail } from "@/features/lists/api";
import { renameList } from "@/features/share/api";

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
