import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: m.api }));

import { fetchCompare } from "@/features/compare/api";

beforeEach(() => {
  vi.resetAllMocks();
  m.api.mockResolvedValue({ stores: [], unmatched: [] });
});

const base = { lat: 32.08, lng: 34.78, radiusKm: 10, sort: "price", limit: 100 } as const;
const sent = () => JSON.parse(m.api.mock.calls[0][1].body);

describe("fetchCompare", () => {
  it("posts to api/compare with each item and group and its quantity", async () => {
    const basket = { items: [{ code: "111", quantity: 2 }], groups: [{ ref: "בורגול|kg", quantity: 1 }, { ref: "ביצ|unit|12", quantity: 3 }] };
    await fetchCompare({ ...base, ...basket });
    expect(m.api.mock.calls[0][0]).toBe("api/compare");
    expect(m.api.mock.calls[0][1].method).toBe("POST");
    expect(sent()).toEqual({ ...base, ...basket });
  });

  it("sends an empty groups list for a basket of products only", async () => {
    await fetchCompare({ ...base, items: [{ code: "111", quantity: 1 }], groups: [] });
    expect(sent().groups).toEqual([]);
  });

  it("returns the API response and lets a failure through", async () => {
    m.api.mockResolvedValueOnce({ stores: [], unmatched: ["x|kg"] });
    expect(await fetchCompare({ ...base, items: [], groups: [{ ref: "x|kg", quantity: 1 }] })).toEqual({ stores: [], unmatched: ["x|kg"] });
    m.api.mockRejectedValueOnce(new Error("500"));
    await expect(fetchCompare({ ...base, items: [], groups: [{ ref: "x|kg", quantity: 1 }] })).rejects.toThrow("500");
  });
});
