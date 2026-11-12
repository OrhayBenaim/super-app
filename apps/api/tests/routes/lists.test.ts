import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

let app: ReturnType<typeof createApp>;
let deps: ReturnType<typeof buildDeps>;
let dana: string;
let eli: string;

async function signUp(email: string, name: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password1234", name }),
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

function call(cookie: string, method: string, path: string, body?: unknown) {
  return app.request(`/api/lists${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  deps = buildDeps(loadConfig());
  app = createApp(deps);
  dana = await signUp("dana@lists.test", "Dana");
  eli = await signUp("eli@lists.test", "Eli");
});

describe("lists", () => {
  let listId: string;
  let itemId: string;

  it("401 without a session", async () => {
    expect((await app.request("/api/lists")).status).toBe(401);
  });

  it("auto-creates הרשימה שלי on first GET, once", async () => {
    const lists = await (await call(dana, "GET", "")).json();
    expect(lists).toMatchObject([{ name: "הרשימה שלי", role: "owner", memberCount: 1 }]);
    listId = lists[0].id;
    expect(await (await call(dana, "GET", "")).json()).toHaveLength(1);
  });

  it("creates items, rejects bad bodies, orders categories by use", async () => {
    const res = await call(dana, "POST", `/${listId}/items`, { id: randomUUID(), name: "Milk", category: "Dairy" });
    expect(res.status).toBe(200);
    const item = await res.json();
    expect(item).toMatchObject({ listId, name: "Milk", category: "Dairy", productCode: null, missing: true });
    itemId = item.id;
    await call(dana, "POST", `/${listId}/items`, { id: randomUUID(), name: "Cheese", category: "Dairy", productCode: "7290000000001" });
    await call(dana, "POST", `/${listId}/items`, { id: randomUUID(), name: "Apples", category: "Produce" });
    await call(dana, "POST", `/${listId}/items`, { id: randomUUID(), name: "Bread", category: "Bakery" });
    expect((await call(dana, "POST", `/${listId}/items`, { id: randomUUID(), name: "" })).status).toBe(400);
    expect(await (await call(dana, "GET", `/${listId}/categories`)).json()).toEqual(["Dairy", "Bakery", "Produce"]);
  });

  it("patches missing and clears productCode, bumping list.updatedAt", async () => {
    const before = (await (await call(dana, "GET", `/${listId}`)).json()).list.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const res = await call(dana, "PATCH", `/${listId}/items/${itemId}`, { missing: false, productCode: null });
    expect(await res.json()).toMatchObject({ id: itemId, missing: false, productCode: null });
    const after = (await (await call(dana, "GET", `/${listId}`)).json()).list.updatedAt;
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(before));
  });

  it("deletes an item", async () => {
    const bread = (await (await call(dana, "GET", `/${listId}`)).json()).items.find((i: { name: string }) => i.name === "Bread");
    expect((await call(dana, "DELETE", `/${listId}/items/${bread.id}`)).status).toBe(204);
    expect((await call(dana, "DELETE", `/${listId}/items/${bread.id}`)).status).toBe(404);
  });

  it("non-member gets 404 on the list and its items", async () => {
    expect((await call(eli, "GET", `/${listId}`)).status).toBe(404);
    expect((await call(eli, "POST", `/${listId}/items`, { id: randomUUID(), name: "x", category: "y" })).status).toBe(404);
    expect((await call(eli, "POST", `/${listId}/invite`)).status).toBe(404);
  });

  it("invite + join shares the same items; unknown code is 404", async () => {
    const { code, url } = await (await call(dana, "POST", `/${listId}/invite`)).json();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(url).toBe(`grocer://join/${code}`);
    expect((await call(eli, "POST", "/join", { code: "ZZZZZZZZ" })).status).toBe(404);
    const joined = await (await call(eli, "POST", "/join", { code })).json();
    expect(joined).toMatchObject({ id: listId, role: "member", memberCount: 2 });
    const a = await (await call(dana, "GET", `/${listId}`)).json();
    const b = await (await call(eli, "GET", `/${listId}`)).json();
    expect(b.items).toEqual(a.items);
    expect(b.members).toHaveLength(2);
  });

  it("member cannot rename (403), owner can", async () => {
    expect((await call(eli, "PATCH", `/${listId}`, { name: "Mine now" })).status).toBe(403);
    const res = await call(dana, "PATCH", `/${listId}`, { name: "Family" });
    expect(await res.json()).toMatchObject({ name: "Family", role: "owner" });
  });

  it("owner cannot leave; member cannot remove the owner", async () => {
    const { ownerId } = (await (await call(dana, "GET", `/${listId}`)).json()).list;
    expect((await call(dana, "DELETE", `/${listId}/members/${ownerId}`)).status).toBe(400);
    expect((await call(eli, "DELETE", `/${listId}/members/${ownerId}`)).status).toBe(403);
  });

  it("owner removes a member, who then gets 404", async () => {
    const { members } = await (await call(dana, "GET", `/${listId}`)).json();
    const eliId = members.find((m: { role: string }) => m.role === "member").userId;
    expect((await call(dana, "DELETE", `/${listId}/members/${eliId}`)).status).toBe(204);
    expect((await call(eli, "GET", `/${listId}`)).status).toBe(404);
  });
});

describe("item ids are made by the phone", () => {
  let owner: string;
  let other: string;
  let listId: string;
  let otherList: string;
  const id = randomUUID();

  beforeAll(async () => {
    owner = await signUp("owner@ids.test", "Owner");
    other = await signUp("other@ids.test", "Other");
    listId = (await (await call(owner, "GET", "")).json())[0].id;
    otherList = (await (await call(other, "GET", "")).json())[0].id;
  });

  it("401 without a session", async () => {
    const res = await app.request(`/api/lists/${listId}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name: "x", category: "y" }) });
    expect(res.status).toBe(401);
  });

  it("creates the item under the sent id", async () => {
    const res = await call(owner, "POST", `/${listId}/items`, { id, name: "Milk", category: "Dairy" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, listId, name: "Milk" });
  });

  it("the same id again returns the item unchanged and creates nothing", async () => {
    const before = await (await call(owner, "GET", `/${listId}`)).json();
    const res = await call(owner, "POST", `/${listId}/items`, { id, name: "Other name", category: "Else", quantity: 5 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, name: "Milk", category: "Dairy", quantity: 1 });
    const after = await (await call(owner, "GET", `/${listId}`)).json();
    expect(after.items).toEqual(before.items);
    expect(after.list.updatedAt).toBe(before.list.updatedAt);
  });

  it("a missing or malformed id is 400", async () => {
    for (const bad of [undefined, "", "pending-1", "not-a-uuid", 7, null]) {
      expect((await call(owner, "POST", `/${listId}/items`, { id: bad, name: "x", category: "y" })).status, String(bad)).toBe(400);
    }
  });

  it("an id on another List is 404 and nothing is created", async () => {
    expect((await call(other, "POST", `/${otherList}/items`, { id, name: "x", category: "y" })).status).toBe(404);
    expect((await (await call(other, "GET", `/${otherList}`)).json()).items).toEqual([]);
  });

  it("Undo-style re-create after a delete keeps the id and Quantity", async () => {
    const undoId = randomUUID();
    const body = { id: undoId, name: "Eggs", category: "Dairy", quantity: 6, missing: false };
    await call(owner, "POST", `/${listId}/items`, body);
    expect((await call(owner, "DELETE", `/${listId}/items/${undoId}`)).status).toBe(204);
    expect((await call(owner, "DELETE", `/${listId}/items/${undoId}`)).status).toBe(404);
    expect(await (await call(owner, "POST", `/${listId}/items`, body)).json()).toMatchObject({ id: undoId, quantity: 6, missing: false });
  });
});
