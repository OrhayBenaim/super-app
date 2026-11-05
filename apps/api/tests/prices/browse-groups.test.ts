// regroupProducts moves the Products a group edit touched in browse's copy (docs/adr/0007) in one pass.
import { expect, it } from "vitest";
import { regroupProducts } from "#/prices/browse-groups.ts";
import { groupWorld, MILK1, MILK3, POWDER, SHOKO, SOY, SOY_LIGHT, sku } from "../__fixtures__/group-world.ts";

it("gives the same catalog for a batch as for its Products moved one at a time", async () => {
  const { deps } = await groupWorld();
  const sqlite = deps.db.$client;
  const edit = sqlite.prepare("INSERT INTO group_products (ref, code, added) VALUES (?, ?, ?)");
  sqlite.prepare("INSERT INTO made_groups (id, name, product_type, measure, size) VALUES (1, 'סויה', 'dairy-eggs', 'l', 1), (2, 'אבקה', 'drinks', 'kg', 1)").run();
  edit.run("made:1", sku(SOY.code), 1); // a new card two Products share
  edit.run("made:1", sku(SOY_LIGHT.code), 1);
  edit.run("made:2", sku(POWDER.code), 1); // a card of another Product type
  edit.run("חלב|l", sku(SHOKO.code), 0); // removed: alone
  edit.run("חלב תנובה|l", sku(MILK1.code), 1); // added to two groups: the first claims it
  edit.run("חלב טרה|l", sku(MILK1.code), 1);
  edit.run("made:1", sku(MILK3.code), 1); // a Made group claims it before a word group
  const codes = [SOY, SOY_LIGHT, POWDER, SHOKO, MILK1, MILK3, SOY].map((p) => sku(p.code)); // a code twice
  const snapshot = () => [
    sqlite.prepare("SELECT groups, per_unit, group_types, group_stores FROM browse_catalog").raw().all(),
    sqlite.prepare("SELECT * FROM browse_groups ORDER BY id").all(),
  ];

  sqlite.exec("BEGIN");
  for (const code of codes) regroupProducts(deps.db, [code]);
  const oneByOne = snapshot();
  sqlite.exec("ROLLBACK");
  const before = snapshot();
  regroupProducts(deps.db, codes);

  expect(snapshot()).toEqual(oneByOne);
  expect(snapshot()).not.toEqual(before);
});
