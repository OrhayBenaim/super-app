import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, SETTLE_MS } from "@/features/compare/debounce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("debounce", () => {
  it("sends one Compare request with the final basket after several changes in the window", () => {
    const compare = vi.fn();
    const settle = debounce(compare, SETTLE_MS);
    settle({ items: [{ code: "1", quantity: 1 }], groups: [] });
    vi.advanceTimersByTime(SETTLE_MS - 1);
    settle({ items: [], groups: [] });
    vi.advanceTimersByTime(SETTLE_MS - 1);
    const last = { items: [{ code: "2", quantity: 3 }], groups: [] };
    settle(last);
    expect(compare).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(compare).toHaveBeenCalledOnce();
    expect(compare).toHaveBeenCalledWith(last);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const settle = debounce(fn, SETTLE_MS);
    settle(1);
    settle.cancel();
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(fn).not.toHaveBeenCalled();
  });
});
