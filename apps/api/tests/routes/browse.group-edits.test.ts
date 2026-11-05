// Home's cards over the team's group edits and Made groups (docs/adr/0007): an edit moves its Products at once.
import { describe, expect, it } from "vitest";
import { groupWorld, MILK1, MILK3, near, SHOKO, SOY, SOY_LIGHT, sku } from "../__fixtures__/group-world.ts";

type Card = { ref: string | null; name: string; codes: string[]; minPrice: number | null };
type World = Awaited<ReturnType<typeof groupWorld>>;
const cards = async ({ user }: World) => (await (await user(`/api/browse/types/dairy-eggs?${near}`)).json()) as Card[];
const page = async ({ user }: World, ref: string) => user(`/api/browse/types/dairy-eggs/groups/${encodeURIComponent(ref)}?${near}`);
const MILK = "חלב|l";

describe("Home after a group edit", () => {
  it("shows a Made group's card under its Product type, holding its Products, and opens it", async () => {
    const w = await groupWorld();
    const { ref } = (await (await w.team("/groups", "POST", { name: "חלב סויה", productType: "dairy-eggs", measure: "l", codes: [sku(SOY.code), sku(SOY_LIGHT.code)] })).json()) as { ref: string };

    const card = (await cards(w)).find((c) => c.ref === ref);
    expect(card).toMatchObject({ name: "חלב סויה", minPrice: 8.9 });
    expect(card!.codes.sort()).toEqual([sku(SOY.code), sku(SOY_LIGHT.code)].sort());
    expect((await cards(w)).filter((c) => c.codes.includes(sku(SOY.code)))).toHaveLength(1); // on one card only

    const res = await page(w, ref);
    expect(res.status).toBe(200);
    const { products } = (await res.json()) as { products: { code: string }[] };
    expect(products.map((p) => p.code).sort()).toEqual([sku(SOY.code), sku(SOY_LIGHT.code)].sort());

    expect((await w.team(`/groups/${ref}`, "DELETE")).status).toBe(200);
    expect((await cards(w)).some((c) => c.ref === ref)).toBe(false);
    expect((await cards(w)).filter((c) => c.codes.includes(sku(SOY.code)))).toHaveLength(1); // back on a word card
    expect((await page(w, ref)).status).toBe(404);
  });

  it("takes a removed Product off its group's card and page, and an added one on, under the group's new name", async () => {
    const w = await groupWorld();
    await w.team(`/groups/${encodeURIComponent(MILK)}/products/${encodeURIComponent(sku(SHOKO.code))}`, "DELETE");
    await w.team(`/groups/${encodeURIComponent(MILK)}/products`, "POST", { code: sku(SOY.code) });
    await w.team(`/groups/${encodeURIComponent(MILK)}/name`, "PUT", { name: "חלב ומשקאות" });

    const all = await cards(w);
    const milk = all.find((c) => c.ref === MILK)!;
    expect(milk.name).toBe("חלב ומשקאות");
    expect(milk.codes.sort()).toEqual([sku(MILK3.code), sku(MILK1.code), sku(SOY.code)].sort());
    expect(all.filter((c) => c.codes.includes(sku(SHOKO.code)))).toHaveLength(1); // a card of its own

    const { card, products } = (await (await page(w, MILK)).json()) as { card: Card; products: { code: string }[] };
    expect(card.name).toBe("חלב ומשקאות");
    expect(products.map((p) => p.code).sort()).toEqual([sku(MILK3.code), sku(MILK1.code), sku(SOY.code)].sort());
  });
});
