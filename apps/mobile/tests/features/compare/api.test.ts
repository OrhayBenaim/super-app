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
  it("posts to api/compare with each group ref as { ref }", async () => {
    await fetchCompare({ ...base, codes: ["111"], groups: ["בורגול|kg", "ביצ|unit|12"] });
    expect(m.api.mock.calls[0][0]).toBe("api/compare");
    expect(m.api.mock.calls[0][1].method).toBe("POST");
    expect(sent()).toEqual({ ...base, codes: ["111"], groups: [{ ref: "בורגול|kg" }, { ref: "ביצ|unit|12" }] });
  });

  it("sends an empty groups list for a basket of codes only", async () => {
    await fetchCompare({ ...base, codes: ["111"], groups: [] });
    expect(sent().groups).toEqual([]);
  });

  it("returns the API response and lets a failure through", async () => {
    m.api.mockResolvedValueOnce({ stores: [], unmatched: ["x|kg"] });
    expect(await fetchCompare({ ...base, codes: [], groups: ["x|kg"] })).toEqual({ stores: [], unmatched: ["x|kg"] });
    m.api.mockRejectedValueOnce(new Error("500"));
    await expect(fetchCompare({ ...base, codes: [], groups: ["x|kg"] })).rejects.toThrow("500");
  });
});
