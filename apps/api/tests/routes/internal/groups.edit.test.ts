// The private app's editable Product groups (docs/adr/0007): the list by Product type, one group, and the team's edits.
import { describe, expect, it } from "vitest";
import { CLOSE, groupWorld, MILK1, MILK3, NEAR, POWDER, SHOKO, SOY, SOY_LIGHT, sku } from "../../__fixtures__/group-world.ts";

const MILK = encodeURIComponent("חלב|l");
const TNUVA1 = { code: "7", name: "חלב תנובה 1% 1 ליטר", qty: 1, unit: "ליטר", price: 5.2 };
const soy = { name: "חלב סויה", productType: "dairy-eggs", measure: "l", codes: [sku(SOY.code), sku(SOY_LIGHT.code)] };

type Listed = { ref: string; name: string; measure: string; productCount: number; made: boolean; edited: boolean };
type List = { groups: Listed[]; total: number; hasMore: boolean; madeOrEdited: number };

describe("GET /groups/types/:type (private)", () => {
  it("lists a Product type's groups as Home groups them, with the Made groups, flagged made or edited, most Products first", async () => {
    const { team } = await groupWorld();
    const before = (await (await team("/groups/types/dairy-eggs")).json()) as List;
    expect(before.groups[0]).toEqual({ ref: "חלב|l", name: "חלב", measure: "l", size: 1, soldBy: "unit", productCount: 3, made: false, edited: false });
    expect(before).toMatchObject({ total: 4, hasMore: false, madeOrEdited: 0 }); // milk, milk powder, the two soy drinks

    const { ref } = (await (await team("/groups", "POST", soy)).json()) as { ref: string };
    await team(`/groups/${MILK}/products/${encodeURIComponent(sku(SHOKO.code))}`, "DELETE");
    const after = (await (await team("/groups/types/dairy-eggs")).json()) as List;
    expect(after.groups.slice(0, 2)).toEqual([
      { ref: "חלב|l", name: "חלב", measure: "l", size: 1, soldBy: "unit", productCount: 2, made: false, edited: true },
      { ref, name: "חלב סויה", measure: "l", size: 1, soldBy: "unit", productCount: 2, made: true, edited: false },
    ]);
    expect(after.madeOrEdited).toBe(2);
    expect(after.groups.some((g) => g.ref.startsWith("משקה סויה"))).toBe(false); // the soy drinks are on the Made group's card
  });

  it("filters by name and pages", async () => {
    const { team } = await groupWorld();
    const page1 = (await (await team(`/groups/types/dairy-eggs?q=${encodeURIComponent("חלב")}&pageSize=1`)).json()) as List;
    expect(page1.groups.map((g) => g.name)).toEqual(["חלב"]);
    expect(page1).toMatchObject({ total: 2, hasMore: true }); // חלב, חלב אבקה
    const page2 = (await (await team(`/groups/types/dairy-eggs?q=${encodeURIComponent("חלב")}&pageSize=1&page=2`)).json()) as List;
    expect(page2).toMatchObject({ groups: [{ name: "חלב אבקה" }], hasMore: false });
    expect(((await (await team("/groups/types/drinks")).json()) as List).groups).toEqual([]);
  });

  it("is 400 for a bad type or page and 401 without the token", async () => {
    const { team } = await groupWorld();
    for (const path of ["types/nope", "types/dairy-eggs?page=0", "types/dairy-eggs?pageSize=101"]) expect((await team(`/groups/${path}`)).status, path).toBe(400);
    expect((await team("/groups/types/dairy-eggs", "GET", undefined, "Bearer wrong")).status).toBe(401);
  });
});

describe("GET /groups/:ref (private)", () => {
  it("returns a word group's facts, narrower groups and members, cheapest per liter first", async () => {
    const { team } = await groupWorld({ near: [...NEAR, TNUVA1], close: CLOSE });
    const res = await team(`/groups/${MILK}`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as { group: unknown; narrower: unknown; members: { code: string; minPrice: number }[] };
    expect(detail.group).toEqual({
      ref: "חלב|l", name: "חלב", type: "dairy-eggs", measure: "l", size: 1, soldBy: "unit", productCount: 4, storeCount: 2, made: false, edited: false,
    });
    expect(detail.narrower).toEqual([{ ref: "חלב תנובה|l", name: "חלב תנובה", productCount: 2 }]);
    expect(detail.members.map((m) => [m.code, m.minPrice])).toEqual([
      [sku(SHOKO.code), 4], [sku(MILK1.code), 5], [sku(TNUVA1.code), 5.2], [sku(MILK3.code), 5.5],
    ]);
    expect(detail.members[0]).toEqual({ code: sku(SHOKO.code), name: SHOKO.name, measure: "l", size: 1, soldBy: "unit", minPrice: 4, storeCount: 1 });
  });

  it("returns a Made group with exactly its Products", async () => {
    const { team } = await groupWorld();
    const { ref } = (await (await team("/groups", "POST", soy)).json()) as { ref: string };
    const detail = (await (await team(`/groups/${ref}`)).json()) as { group: unknown; narrower: unknown; members: { code: string }[] };
    expect(detail.group).toEqual({
      ref, name: "חלב סויה", type: "dairy-eggs", measure: "l", size: 1, soldBy: "unit", productCount: 2, storeCount: 2, made: true, edited: false,
    });
    expect(detail.narrower).toEqual([]);
    expect(detail.members.map((m) => m.code)).toEqual([sku(SOY_LIGHT.code), sku(SOY.code)]);
  });

  it("is 404 for words no Product starts or a Made group that is not there, 400 for a bad ref, 401 without the token", async () => {
    const { team } = await groupWorld();
    for (const ref of ["קקק|l", "made:999"]) expect((await team(`/groups/${encodeURIComponent(ref)}`)).status, ref).toBe(404);
    for (const ref of ["x", "חלב|liters", "made:0", "made:abc"]) expect((await team(`/groups/${encodeURIComponent(ref)}`)).status, ref).toBe(400);
    expect((await team(`/groups/${MILK}`, "GET", undefined, "")).status).toBe(401);
  });
});

describe("the team's edits (private)", () => {
  it("renames a word group and a Made group", async () => {
    const { team } = await groupWorld();
    expect((await team(`/groups/${MILK}/name`, "PUT", { name: "חלב בקרטון" })).status).toBe(200);
    expect(await (await team(`/groups/${MILK}`)).json()).toMatchObject({ group: { name: "חלב בקרטון", edited: true } });
    const { ref } = (await (await team("/groups", "POST", soy)).json()) as { ref: string };
    expect((await team(`/groups/${ref}/name`, "PUT", { name: "משקאות סויה" })).status).toBe(200);
    expect(await (await team(`/groups/${ref}`)).json()).toMatchObject({ group: { name: "משקאות סויה", made: true } });
  });

  it("adds and removes a Product, and refuses one measured another way", async () => {
    const { team } = await groupWorld();
    expect((await team(`/groups/${MILK}/products`, "POST", { code: sku(SOY.code) })).status).toBe(200);
    expect((await team(`/groups/${MILK}/products/${encodeURIComponent(sku(MILK3.code))}`, "DELETE")).status).toBe(200);
    const { members } = (await (await team(`/groups/${MILK}`)).json()) as { members: { code: string }[] };
    expect(members.map((m) => m.code).sort()).toEqual([sku(MILK1.code), sku(SHOKO.code), sku(SOY.code)].sort());

    // Removed again after being added, added back after being removed: the last edit wins.
    await team(`/groups/${MILK}/products/${encodeURIComponent(sku(SOY.code))}`, "DELETE");
    await team(`/groups/${MILK}/products`, "POST", { code: sku(MILK3.code) });
    const again = (await (await team(`/groups/${MILK}`)).json()) as { members: { code: string }[] };
    expect(again.members.map((m) => m.code).sort()).toEqual([sku(MILK3.code), sku(MILK1.code), sku(SHOKO.code)].sort());

    const powder = await team(`/groups/${MILK}/products`, "POST", { code: sku(POWDER.code) });
    expect(powder.status).toBe(400);
    expect(await powder.json()).toEqual({ error: "a Product measured another way than the group" });
  });

  it("is 404 for a missing group or Product, 400 for a bad body, 401 without the token", async () => {
    const { team } = await groupWorld();
    expect((await team(`/groups/${MILK}/products`, "POST", { code: "nope" })).status).toBe(404);
    expect((await team(`/groups/${MILK}/products/nope`, "DELETE")).status).toBe(404);
    expect((await team(`/groups/${encodeURIComponent("קקק|l")}/products`, "POST", { code: sku(SOY.code) })).status).toBe(404);
    expect((await team("/groups/made:999/name", "PUT", { name: "x" })).status).toBe(404);
    expect((await team(`/groups/${MILK}/products`, "POST", {})).status).toBe(400);
    expect((await team(`/groups/${MILK}/name`, "PUT", { name: " " })).status).toBe(400);
    expect((await team(`/groups/${MILK}/name`, "PUT", { name: "x" }, "Bearer wrong")).status).toBe(401);
    expect((await team(`/groups/${MILK}/products`, "POST", { code: sku(SOY.code) }, "Bearer wrong")).status).toBe(401);
    expect((await team(`/groups/${MILK}/products/${encodeURIComponent(sku(SOY.code))}`, "DELETE", undefined, "Bearer wrong")).status).toBe(401);
  });
});

describe("Made groups (private)", () => {
  it("changes one: its name, Product type, measure and exactly its Products", async () => {
    const { team } = await groupWorld();
    const { ref } = (await (await team("/groups", "POST", soy)).json()) as { ref: string };
    const res = await team(`/groups/${ref}`, "PUT", { name: "סויה", productType: "drinks", measure: "l", codes: [sku(SOY.code)] });
    expect(res.status).toBe(200);
    expect(await (await team(`/groups/${ref}`)).json()).toMatchObject({ group: { name: "סויה", type: "drinks", productCount: 1 }, members: [{ code: sku(SOY.code) }] });
    const drinks = (await (await team("/groups/types/drinks")).json()) as List;
    expect(drinks.groups).toMatchObject([{ ref, made: true, productCount: 1 }]);
    expect(((await (await team("/groups/types/dairy-eggs")).json()) as List).groups.some((g) => g.ref === ref)).toBe(false);
  });

  it("makes a unit group of a pack count, and refuses Products measured another way", async () => {
    const { team } = await groupWorld();
    const refused = await team("/groups", "POST", { ...soy, measure: "kg" });
    expect(refused.status).toBe(400);
    expect((await team("/groups", "POST", { ...soy, codes: ["nope"] })).status).toBe(404);
    const empty = await team("/groups", "POST", { name: "ביצים", productType: "dairy-eggs", measure: "unit", size: 12 });
    expect(empty.status).toBe(201);
    const { ref } = (await empty.json()) as { ref: string };
    expect(await (await team(`/groups/${ref}`)).json()).toMatchObject({ group: { measure: "unit", size: 12, productCount: 0 }, members: [] });
  });

  it("is 400 for a bad body or a word group, 404 for one that is not there, 401 without the token", async () => {
    const { team } = await groupWorld();
    for (const body of [{ ...soy, name: "" }, { ...soy, productType: "nope" }, { ...soy, measure: "unit" }, { ...soy, size: 2 }, { ...soy, codes: "x" }]) {
      expect((await team("/groups", "POST", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await team(`/groups/${MILK}`, "PUT", soy)).status).toBe(400);
    expect((await team(`/groups/${MILK}`, "DELETE")).status).toBe(400);
    expect((await team("/groups/made:999", "PUT", soy)).status).toBe(404);
    expect((await team("/groups/made:999", "DELETE")).status).toBe(404);
    expect((await team("/groups", "POST", soy, "Bearer wrong")).status).toBe(401);
    expect((await team("/groups/made:1", "PUT", soy, "Bearer wrong")).status).toBe(401);
    expect((await team("/groups/made:1", "DELETE", undefined, "Bearer wrong")).status).toBe(401);
  });
});
