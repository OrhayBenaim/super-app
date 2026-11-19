import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDeps } from "#/deps.ts";
import { moveDeadGroupRefs, openDb } from "#/db/index.ts";
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
const codeOf = (name: string) => (sqlite.prepare("SELECT code FROM products WHERE name = ?").get(name) as { code: string }).code;
const edits = () => ({
  names: sqlite.prepare("SELECT ref, name FROM group_names ORDER BY ref").all(),
  products: sqlite.prepare("SELECT ref, code, added FROM group_products ORDER BY ref, code").all(),
});

beforeAll(() => {
  sqlite.exec(`INSERT INTO user (id, name, email) VALUES ('u1', 'U', 'u@x.test'); INSERT INTO lists (id, name, owner_id, invite_code) VALUES ('l1', 'L', 'u1', 'c1')`);
  ingestStores(deps, "osher-ad", `<Root><ChainID>${OSHER}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>x</StoreName><Address>a</Address><City>c</City></Store></Stores></SubChain></SubChains></Root>`);
  const item = (code: string, name: string, unitQty = "מל") =>
    `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${unitQty}</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>30</ItemPrice><UnitOfMeasurePrice>40</UnitOfMeasurePrice></Item>`;
  ingestPrices(deps, "osher-ad", `<Root><ChainID>${OSHER}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${item("7290000000011", "יין 750 מל")}${item("7290000000028", "יין לבן 750 מל")}${item("7290000000035", "יין אדום 750 מל")}${item("7290000000042", "יין שרי 6 יח", "יחידות")}</Items></Root>`);
  give("יין אדום", "ין|l"); // dead
  give("יין שרי", "ין|unit|6"); // dead, a pack count is kept
  give("יין", "יין|l"); // valid
  give("***", "ין|l"); // dead, but its name gives no ref
  give("יין אדום 2", "made:7"); // a Made group
  give("יין לסבתא", "ין|l"); // dead, and so is the group its name gives
  // The team's edits: on a dead ref (moves), on a dead ref whose name gives no live group, and on a dead ref whose
  // live group has edits of its own (both stay).
  sqlite.exec(`INSERT INTO group_names (ref, name) VALUES ('ין|l', 'יין אדום'), ('ין|unit|12', 'יין לסבתא'), ('יינ|l', 'יין'), ('יין|l', 'יינות')`);
  sqlite.prepare("INSERT INTO group_products (ref, code, added) VALUES ('ין|l', ?, 0), ('יינ|l', ?, 0)").run(codeOf("יין לבן 750 מל"), codeOf("יין לבן 750 מל"));
});

describe("startup migration: Items with a dead group ref", () => {
  it("moves a dead ref to the ref its name gives, keeping measure and pack count; leaves the rest; does nothing twice", () => {
    moveDeadGroupRefs(deps.db);
    expect(ref("יין אדום")).toBe("יין אדום|l");
    expect(ref("יין שרי")).toBe("יין שרי|unit|6");
    expect(ref("יין")).toBe("יין|l");
    expect(ref("***")).toBe("ין|l");
    expect(ref("יין אדום 2")).toBe("made:7");
    expect(ref("יין לסבתא")).toBe("ין|l");
    const before = sqlite.prepare("SELECT id, group_ref FROM items ORDER BY id").all();
    const editsBefore = edits();
    moveDeadGroupRefs(deps.db);
    expect(sqlite.prepare("SELECT id, group_ref FROM items ORDER BY id").all()).toEqual(before);
    expect(edits()).toEqual(editsBefore);
  });

  it("moves the team's edits on a dead ref to the live group their display name gives, unless it has edits of its own", () => {
    const white = codeOf("יין לבן 750 מל");
    expect(edits()).toEqual({
      names: [{ ref: "יין אדום|l", name: "יין אדום" }, { ref: "יין|l", name: "יינות" }, { ref: "יינ|l", name: "יין" }, { ref: "ין|unit|12", name: "יין לסבתא" }],
      products: [{ ref: "יין אדום|l", code: white, added: 0 }, { ref: "יינ|l", code: white, added: 0 }],
    });
  });

  it("runs at startup once per database, not on every open", () => {
    const dir = mkdtempSync(join(tmpdir(), "grocer-dead-refs-"));
    const path = join(dir, "test.db");
    const first = openDb(path);
    first.$client.exec(`INSERT INTO products (code, name) VALUES ('7290000000011', 'יין 750 מל'), ('7290000000035', 'יין אדום 750 מל');
      INSERT INTO user (id, name, email) VALUES ('u1', 'U', 'u@x.test'); INSERT INTO lists (id, name, owner_id, invite_code) VALUES ('l1', 'L', 'u1', 'c1');
      INSERT INTO items (id, list_id, name, category, group_ref) VALUES ('i1', 'l1', 'יין אדום', 'x', 'ין|l')`);
    first.$client.close();
    const second = openDb(path);
    expect(second.$client.prepare("SELECT group_ref AS r FROM items WHERE id = 'i1'").get()).toEqual({ r: "ין|l" });
    // A database left at version 2 (before edits moved too) runs it once more.
    second.$client.pragma("user_version = 2");
    second.$client.close();
    const third = openDb(path);
    expect(third.$client.prepare("SELECT group_ref AS r FROM items WHERE id = 'i1'").get()).toEqual({ r: "יין אדום|l" });
    third.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves every ref alone on an empty catalog", () => {
    const { db } = buildDeps(loadConfig());
    db.$client.exec(`INSERT INTO user (id, name, email) VALUES ('u1', 'U', 'u@x.test'); INSERT INTO lists (id, name, owner_id, invite_code) VALUES ('l1', 'L', 'u1', 'c1');
      INSERT INTO items (id, list_id, name, category, group_ref) VALUES ('i1', 'l1', 'יין אדום', 'x', 'בורגול|kg')`);
    moveDeadGroupRefs(db);
    expect(db.$client.prepare("SELECT group_ref AS r FROM items WHERE id = 'i1'").get()).toEqual({ r: "בורגול|kg" });
  });
});
