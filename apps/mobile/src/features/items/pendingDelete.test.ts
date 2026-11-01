import { describe, expect, it } from "vitest";
import type { Item } from "@/features/lists/api";
import { requestDelete, takePendingDelete } from "./pendingDelete";

const item = { id: "1", name: "חלב" } as Item;

describe("pendingDelete", () => {
  it("hands a requested delete over exactly once", () => {
    expect(takePendingDelete()).toBeNull();
    requestDelete(item);
    expect(takePendingDelete()).toBe(item);
    expect(takePendingDelete()).toBeNull();
  });
});
