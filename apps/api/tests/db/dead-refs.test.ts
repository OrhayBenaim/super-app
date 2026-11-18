import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { moveDeadGroupRefs } from "#/db/index.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const deps = buildDeps(loadConfig());
const sqlite = deps.db.$client;
const itemIds = new Map<string, string>();

const give = (name: string, groupRef: string) => {
  const id = randomUUID();
  itemIds.set(name, id);
  sqlite.prepare("INSERT INTO items (id, list_id, name, category, group_ref) VALUES (?, 'l1', ?, 'x', ?)").run(id, name, groupRef);
};
const ref = (name: string) => (sqlite.prepare("SELECT group_ref AS r FROM items WHERE id = ?").get(itemIds.get(name)) as { r: string | null }).r;

beforeAll(() => {
  sqlite.exec(`INSERT INTO user (id, name, email) VALUES ('u1', 'U', 'u@x.test'); INSERT INTO lists (id, name, owner_id, invite_code) VALUES ('l1', 'L', 'u1', 'c1')`);
  ingestStores(deps, "osher-ad", `<Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>x</StoreName><Address>a</Address><City>c</City></Store></Stores></SubChain></SubChains></Root>`);
  const item = (code: string, name: string) =>
    `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>מל</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>30</ItemPrice><UnitOfMeasurePrice>40</UnitOfMeasurePrice></Item>`;
  ingestPrices(deps, "osher-ad", `<Root><ChainID>${OSHER}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${item("7290000000011", "יין 750 מל")}${item("7290000000028", "יין לבן 750 מל")}</Items></Root>`);
  give("יין אדום", "ין|l"); // dead
  give("יין שרי", "ין|unit|6"); // dead, a pack count is kept
  give("יין", "יין|l"); // valid
  give("***", "ין|l"); // dead, but its name gives no ref
  give("יין אדום 2", "made:7"); // a Made group
});

describe("startup migration: Items with a dead group ref", () => {
  it("moves a dead ref to the ref its name gives, keeping measure and pack count; leaves the rest; does nothing twice", () => {
    moveDeadGroupRefs(deps.db);
    expect(ref("יין אדום")).toBe("יין אדום|l");
    expect(ref("יין שרי")).toBe("יין שרי|unit|6");
    expect(ref("יין")).toBe("יין|l");
    expect(ref("***")).toBe("ין|l");
    expect(ref("יין אדום 2")).toBe("made:7");
    const before = sqlite.prepare("SELECT id, group_ref FROM items ORDER BY id").all();
    moveDeadGroupRefs(deps.db);
    expect(sqlite.prepare("SELECT id, group_ref FROM items ORDER BY id").all()).toEqual(before);
  });

  it("leaves every ref alone on an empty catalog", () => {
    const { db } = buildDeps(loadConfig());
    db.$client.exec(`INSERT INTO user (id, name, email) VALUES ('u1', 'U', 'u@x.test'); INSERT INTO lists (id, name, owner_id, invite_code) VALUES ('l1', 'L', 'u1', 'c1');
      INSERT INTO items (id, list_id, name, category, group_ref) VALUES ('i1', 'l1', 'יין אדום', 'x', 'בורגול|kg')`);
    moveDeadGroupRefs(db);
    expect(db.$client.prepare("SELECT group_ref AS r FROM items WHERE id = 'i1'").get()).toEqual({ r: "בורגול|kg" });
  });
});
