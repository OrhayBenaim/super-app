// A Price sync never changes the team's group edits or Made groups (docs/adr/0007), and browse's copy keeps them.
import { expect, it } from "vitest";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { groupWorld, MILK1, MILK3, near, SHOKO, SOY, SOY_LIGHT, sku } from "../__fixtures__/group-world.ts";

const MILK = encodeURIComponent("חלב|l");

it("keeps every edit and Made group, and Home and search still follow them", async () => {
  const { deps, user, team } = await groupWorld();
  const { ref } = (await (await team("/groups", "POST", { name: "חלב סויה", productType: "dairy-eggs", measure: "l", codes: [sku(SOY.code), sku(SOY_LIGHT.code)] })).json()) as { ref: string };
  await team(`/groups/${MILK}/products/${encodeURIComponent(sku(SHOKO.code))}`, "DELETE");
  await team(`/groups/${MILK}/name`, "PUT", { name: "חלב בקרטון" });
  const tables = () => ["made_groups", "group_names", "group_products"].map((t) => deps.db.$client.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all());
  const before = tables();

  await priceSyncJob(deps)({});

  expect(tables()).toEqual(before);
  const cards = (await (await user(`/api/browse/types/dairy-eggs?${near}`)).json()) as { ref: string | null; name: string; codes: string[] }[];
  expect(cards.find((c) => c.ref === "חלב|l")).toMatchObject({ name: "חלב בקרטון", codes: [sku(MILK3.code), sku(MILK1.code)] });
  expect(cards.find((c) => c.ref === "חלב|l")!.codes).not.toContain(sku(SHOKO.code));
  expect(cards.find((c) => c.ref === ref)!.codes.sort()).toEqual([sku(SOY.code), sku(SOY_LIGHT.code)].sort());
  const found = (await (await user(`/api/products/search?q=${encodeURIComponent("חלב")}`)).json()) as { ref?: string; name: string; productCount?: number }[];
  expect(found.find((g) => g.ref === "חלב|l")).toMatchObject({ name: "חלב בקרטון", productCount: 2 });
  expect(found.find((g) => g.ref === ref)).toMatchObject({ name: "חלב סויה", productCount: 2 });
});
