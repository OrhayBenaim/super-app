// The app's search, Compare and Lists over the team's group edits and Made groups (docs/adr/0007).
import { describe, expect, it } from "vitest";
import { groupWorld, here, MILK1, MILK3, SHOKO, SOY, SOY_LIGHT, sku } from "../__fixtures__/group-world.ts";

type Found = { kind: string; ref?: string; name: string; productCount?: number; minPrice: number; topCodes?: string[] };
const search = async (user: Awaited<ReturnType<typeof groupWorld>>["user"], q: string) =>
  (await (await user(`/api/products/search?q=${encodeURIComponent(q)}`)).json()) as Found[];
const compare = async (user: Awaited<ReturnType<typeof groupWorld>>["user"], ref: string) => {
  const res = await user("/api/compare", "POST", { ...here, groups: [{ ref, quantity: 1 }] });
  expect(res.status).toBe(200);
  return (await res.json()) as { stores: { storeName: string; total: number; items: { code: string }[] }[]; unmatched: string[] };
};
const soyGroup = { name: "חלב סויה", productType: "dairy-eggs", measure: "l", codes: [sku(SOY.code), sku(SOY_LIGHT.code)] };

describe("a removed Product", () => {
  it("leaves its group in search and in Compare, whatever the next Price sync brings", async () => {
    const { user, team } = await groupWorld();
    const milk = (await search(user, "חלב")).find((r) => r.ref === "חלב|l")!;
    expect(milk).toMatchObject({ productCount: 3, minPrice: 4 }); // the chocolate milk at ₪4
    expect((await compare(user, "חלב|l")).stores.find((s) => s.storeName === "near")!.items[0]!.code).toBe(sku(SHOKO.code));

    expect((await team(`/groups/${encodeURIComponent("חלב|l")}/products/${encodeURIComponent(sku(SHOKO.code))}`, "DELETE")).status).toBe(200);

    const after = (await search(user, "חלב")).find((r) => r.ref === "חלב|l")!;
    expect(after).toMatchObject({ productCount: 2, minPrice: 5 });
    expect(after.topCodes).not.toContain(sku(SHOKO.code));
    expect((await search(user, "חלב")).some((r) => r.kind === "product" && r.name === SHOKO.name)).toBe(true); // still a Product
    expect((await compare(user, "חלב|l")).stores.find((s) => s.storeName === "near")!.items[0]!.code).toBe(sku(MILK1.code));
  });

  it("an added one joins the group", async () => {
    const { user, team } = await groupWorld();
    const res = await team(`/groups/${encodeURIComponent("חלב|l")}/products`, "POST", { code: sku(SOY_LIGHT.code) });
    expect(res.status).toBe(200);
    expect((await search(user, "חלב")).find((r) => r.ref === "חלב|l")).toMatchObject({ productCount: 4 });
    expect((await compare(user, "חלב|l")).stores.find((s) => s.storeName === "near")!.items[0]!.code).toBe(sku(SHOKO.code));
  });
});

describe("a Made group", () => {
  it("is found by search by the words of its name and priced by Compare", async () => {
    const { user, team } = await groupWorld();
    const res = await team("/groups", "POST", soyGroup);
    expect(res.status).toBe(201);
    const { ref } = (await res.json()) as { ref: string };
    expect(ref).toMatch(/^made:\d+$/);

    for (const q of ["חלב", "חלב סויה"]) {
      expect((await search(user, q)).find((r) => r.ref === ref), q).toMatchObject({ kind: "group", name: "חלב סויה", productCount: 2, minPrice: 8.9 });
    }
    expect((await search(user, "סויה")).some((r) => r.ref === ref)).toBe(false); // its name starts with חלב

    const { stores, unmatched } = await compare(user, ref);
    expect(unmatched).toEqual([]);
    expect(stores.map((s) => [s.storeName, s.total])).toEqual([["near", 8.9], ["close", 9.5]]);
  });

  it("deleted, leaves the List items matched to it unmatched", async () => {
    const { user, team } = await groupWorld();
    const { ref } = (await (await team("/groups", "POST", soyGroup)).json()) as { ref: string };
    const [list] = (await (await user("/api/lists")).json()) as { id: string }[];
    const added = await user(`/api/lists/${list!.id}/items`, "POST", { name: "חלב סויה", category: "חלב", groupRef: ref });
    expect(added.status).toBe(200);

    expect((await team(`/groups/${ref}`, "DELETE")).status).toBe(200);

    const { items } = (await (await user(`/api/lists/${list!.id}`)).json()) as { items: { groupRef: string; soldBy: string }[] };
    expect(items).toMatchObject([{ groupRef: ref, soldBy: "unit" }]);
    const { stores, unmatched } = await compare(user, ref);
    expect(unmatched).toEqual([ref]);
    expect(stores).toEqual([]);
  });
});

it("Milk products in a Made group stay in their word group", async () => {
  const { user, team } = await groupWorld();
  await team("/groups", "POST", { name: "חלב מלא", productType: "dairy-eggs", measure: "l", codes: [sku(MILK3.code)] });
  expect((await search(user, "חלב")).find((r) => r.ref === "חלב|l")).toMatchObject({ productCount: 3 });
});
