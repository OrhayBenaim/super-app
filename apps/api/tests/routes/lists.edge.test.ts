import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

let app: ReturnType<typeof createApp>;
let deps: ReturnType<typeof buildDeps>;
let owner: string;
let member: string;
let other: string;
let third: string;

async function signUp(email: string, name: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password1234", name }),
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

// `raw` sends the body verbatim (malformed JSON); otherwise it is JSON-encoded.
function call(cookie: string | null, method: string, path: string, body?: unknown, raw?: string) {
  return app.request(`/api/lists${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    body: method === "GET" ? undefined : (raw ?? (body === undefined ? undefined : JSON.stringify(body))),
  });
}
const json = async (res: Response) => res.json() as Promise<any>;
const sleep = () => new Promise((r) => setTimeout(r, 4));

async function newList(cookie: string, name = "L") {
  return (await json(await call(cookie, "POST", "", { name }))).id as string;
}
async function addItem(cookie: string, listId: string, body: Record<string, unknown>) {
  return json(await call(cookie, "POST", `/${listId}/items`, { name: "x", category: "c", ...body }));
}
async function detail(cookie: string, listId: string) {
  return json(await call(cookie, "GET", `/${listId}`));
}
async function inviteCode(cookie: string, listId: string) {
  return (await json(await call(cookie, "POST", `/${listId}/invite`))).code as string;
}

beforeAll(async () => {
  deps = buildDeps(loadConfig());
  app = createApp(deps);
  [owner, member, other, third] = await Promise.all([
    signUp("owner@edge.test", "Owner"),
    signUp("member@edge.test", "Member"),
    signUp("other@edge.test", "Other"),
    signUp("third@edge.test", "Third"),
  ]);
});

describe("health", () => {
  it("is public, JSON, and GET-only", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
    expect((await app.request("/health", { method: "POST" })).status).toBe(404);
  });
});

describe("auth boundary", () => {
  const routes: [string, string][] = [
    ["GET", ""],
    ["POST", ""],
    ["POST", "/join"],
    ["GET", "/some-id"],
    ["PATCH", "/some-id"],
    ["POST", "/some-id/items"],
    ["PATCH", "/some-id/items/item-id"],
    ["DELETE", "/some-id/items/item-id"],
    ["GET", "/some-id/categories"],
    ["POST", "/some-id/invite"],
    ["DELETE", "/some-id/members/user-id"],
  ];

  it.each(routes)("%s /api/lists%s is 401 without a cookie", async (method, path) => {
    const res = await call(null, method, path, { name: "x", category: "y", code: "ABCDEFGH" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("is 401 for a garbage cookie, and POST /api/compare is 401 without one", async () => {
    expect((await call("better-auth.session_token=garbage", "GET", "")).status).toBe(401);
    const res = await app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat: 32, lng: 34, items: [{ code: "1", quantity: 1 }] }),
    });
    expect(res.status).toBe(401);
  });
});

describe("cross-user isolation", () => {
  it("another user cannot read, patch or delete items of a list they are not in (404, data untouched)", async () => {
    const listId = await newList(owner);
    const item = await addItem(owner, listId, { name: "Milk", category: "Dairy" });
    const itemPath = `/${listId}/items/${item.id}`;

    expect((await call(other, "GET", `/${listId}`)).status).toBe(404);
    expect((await call(other, "GET", `/${listId}/categories`)).status).toBe(404);
    expect((await call(other, "PATCH", itemPath, { name: "Hacked" })).status).toBe(404);
    expect((await call(other, "DELETE", itemPath)).status).toBe(404);
    expect((await call(other, "PATCH", `/${listId}`, { name: "Hacked" })).status).toBe(404);
    expect((await call(other, "DELETE", `/${listId}/members/${(await detail(owner, listId)).list.ownerId}`)).status).toBe(404);

    const after = await detail(owner, listId);
    expect(after.list.name).toBe("L");
    expect(after.items).toMatchObject([{ id: item.id, name: "Milk" }]);
  });

  it("cannot reach an item of list B through one's own list A", async () => {
    const mine = await newList(other);
    const theirs = await newList(owner);
    const item = await addItem(owner, theirs, { name: "Secret" });
    expect((await call(other, "PATCH", `/${mine}/items/${item.id}`, { name: "Hacked" })).status).toBe(404);
    expect((await call(other, "DELETE", `/${mine}/items/${item.id}`)).status).toBe(404);
    expect((await detail(owner, theirs)).items[0].name).toBe("Secret");
  });

  it("unknown list ids are 404 for every list-scoped route", async () => {
    for (const [m, p] of [
      ["GET", "/nope"],
      ["PATCH", "/nope"],
      ["POST", "/nope/items"],
      ["GET", "/nope/categories"],
      ["POST", "/nope/invite"],
      ["DELETE", "/nope/members/x"],
    ] as const)
      expect((await call(owner, m, p, { name: "x", category: "y" })).status, `${m} ${p}`).toBe(404);
  });

  it("GET /lists only returns the caller's lists", async () => {
    const lists = await json(await call(third, "GET", ""));
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ name: "My list", role: "owner", memberCount: 1 });
  });
});

describe("validation", () => {
  it("list names: empty, whitespace, 201+ chars -> 400; trimmed and 200 chars ok", async () => {
    for (const name of ["", "   ", "a".repeat(201), "a".repeat(300)]) expect((await call(owner, "POST", "", { name })).status).toBe(400);
    expect((await call(owner, "POST", "", { name: 5 })).status).toBe(400);
    expect((await call(owner, "POST", "", {})).status).toBe(400);
    expect(await json(await call(owner, "POST", "", { name: "  Home  " }))).toMatchObject({ name: "Home", role: "owner", memberCount: 1 });
    expect((await call(owner, "POST", "", { name: "a".repeat(200) })).status).toBe(200);
  });

  it("rejects malformed, empty and non-object JSON bodies with 400", async () => {
    const listId = await newList(owner);
    const item = await addItem(owner, listId, {});
    for (const [m, p] of [
      ["POST", ""],
      ["POST", "/join"],
      ["PATCH", `/${listId}`],
      ["POST", `/${listId}/items`],
      ["PATCH", `/${listId}/items/${item.id}`],
    ] as const) {
      expect((await call(owner, m, p, undefined, "{not json")).status, `${m} ${p} malformed`).toBe(400);
      expect((await call(owner, m, p, undefined, "")).status, `${m} ${p} empty`).toBe(400);
      expect((await call(owner, m, p, undefined, "[]")).status, `${m} ${p} array`).toBe(400);
      expect((await call(owner, m, p, undefined, "null")).status, `${m} ${p} null`).toBe(400);
    }
    const err = await json(await call(owner, "POST", "", undefined, "{not json"));
    expect(typeof err.error).toBe("string");
  });

  it("item create: bad name/category/missing/productCode -> 400, nothing stored", async () => {
    const listId = await newList(owner);
    const bad: Record<string, unknown>[] = [
      { name: "" },
      { name: "   " },
      { name: "a".repeat(300) },
      { name: 1 },
      { category: "" },
      { category: "c".repeat(101) },
      { missing: "yes" },
      { missing: 1 },
      { missing: null },
      { productCode: "" },
      { productCode: 123 },
      { productCode: "9".repeat(65) },
    ];
    for (const b of bad) expect((await call(owner, "POST", `/${listId}/items`, { name: "x", category: "c", ...b })).status, JSON.stringify(b)).toBe(400);
    expect((await call(owner, "POST", `/${listId}/items`, { name: "x" })).status).toBe(400); // category is required
    expect((await detail(owner, listId)).items).toEqual([]);
  });

  it("item create: defaults and trimming", async () => {
    const listId = await newList(owner);
    const item = await addItem(owner, listId, { name: "  Milk ", category: " Dairy " });
    expect(item).toMatchObject({ listId, name: "Milk", category: "Dairy", productCode: null, missing: true });
    expect(await addItem(owner, listId, { missing: false, productCode: "7290000000001" })).toMatchObject({ missing: false, productCode: "7290000000001" });
    expect(await addItem(owner, listId, { productCode: null })).toMatchObject({ productCode: null });
    expect(await addItem(owner, listId, { name: "a".repeat(200) })).toMatchObject({ name: "a".repeat(200) });
  });

  it("item patch: invalid fields -> 400 and leave the item unchanged", async () => {
    const listId = await newList(owner);
    const item = await addItem(owner, listId, { name: "Milk", category: "Dairy", productCode: "123" });
    const path = `/${listId}/items/${item.id}`;
    for (const b of [{ name: "" }, { name: "a".repeat(300) }, { missing: "no" }, { missing: null }, { category: "" }, { productCode: "" }, { productCode: 5 }])
      expect((await call(owner, "PATCH", path, b)).status, JSON.stringify(b)).toBe(400);
    expect((await detail(owner, listId)).items[0]).toMatchObject({ name: "Milk", category: "Dairy", productCode: "123", missing: true });
  });

  it("item patch: null clears productCode, absent keeps it, partial updates work", async () => {
    const listId = await newList(owner);
    const item = await addItem(owner, listId, { name: "Milk", category: "Dairy", productCode: "123" });
    const path = `/${listId}/items/${item.id}`;
    expect(await json(await call(owner, "PATCH", path, { name: "Milk 3%" }))).toMatchObject({ name: "Milk 3%", productCode: "123", category: "Dairy" });
    expect(await json(await call(owner, "PATCH", path, { productCode: null }))).toMatchObject({ productCode: null, name: "Milk 3%" });
    expect(await json(await call(owner, "PATCH", path, { productCode: " 456 " }))).toMatchObject({ productCode: "456" });
    expect(await json(await call(owner, "PATCH", path, { missing: false }))).toMatchObject({ missing: false, productCode: "456" });
    expect(await json(await call(owner, "PATCH", path, {}))).toMatchObject({ name: "Milk 3%", missing: false });
  });

  it("item patch ignores id/listId/createdAt in the body (no mass assignment)", async () => {
    const listId = await newList(owner);
    const otherList = await newList(owner);
    const item = await addItem(owner, listId, { name: "Milk" });
    const res = await json(await call(owner, "PATCH", `/${listId}/items/${item.id}`, { id: "evil", listId: otherList, createdAt: 0, name: "Milk2" }));
    expect(res).toMatchObject({ id: item.id, listId, name: "Milk2", createdAt: item.createdAt });
    expect((await detail(owner, otherList)).items).toEqual([]);
  });

  it("join body validation", async () => {
    for (const b of [{}, { code: "" }, { code: "   " }, { code: 12345678 }, { code: "A".repeat(33) }])
      expect((await call(owner, "POST", "/join", b)).status, JSON.stringify(b)).toBe(400);
  });

  it("patching or deleting an unknown item is 404", async () => {
    const listId = await newList(owner);
    expect((await call(owner, "PATCH", `/${listId}/items/nope`, { name: "x" })).status).toBe(404);
    expect((await call(owner, "DELETE", `/${listId}/items/nope`)).status).toBe(404);
  });
});

describe("categories", () => {
  it("orders by usage, ties alphabetically, and is [] for an empty list", async () => {
    const listId = await newList(owner);
    expect(await json(await call(owner, "GET", `/${listId}/categories`))).toEqual([]);
    for (const category of ["Zeta", "Beta", "Alpha", "Gamma", "Gamma", "Beta"]) await addItem(owner, listId, { category });
    // Beta x2, Gamma x2, Alpha x1, Zeta x1
    expect(await json(await call(owner, "GET", `/${listId}/categories`))).toEqual(["Beta", "Gamma", "Alpha", "Zeta"]);
  });

  it("follows deletes and category patches; is stable across calls", async () => {
    const listId = await newList(owner);
    const a1 = await addItem(owner, listId, { category: "A" });
    await addItem(owner, listId, { category: "A" });
    await addItem(owner, listId, { category: "B" });
    const b2 = await addItem(owner, listId, { category: "B" });
    await addItem(owner, listId, { category: "B" });
    expect(await json(await call(owner, "GET", `/${listId}/categories`))).toEqual(["B", "A"]);
    await call(owner, "DELETE", `/${listId}/items/${b2.id}`);
    await call(owner, "PATCH", `/${listId}/items/${a1.id}`, { category: "C" });
    // A x1, B x2, C x1
    const first = await json(await call(owner, "GET", `/${listId}/categories`));
    expect(first).toEqual(["B", "A", "C"]);
    expect(await json(await call(owner, "GET", `/${listId}/categories`))).toEqual(first);
  });

  it("does not leak categories of other lists", async () => {
    const a = await newList(owner);
    const b = await newList(owner);
    await addItem(owner, a, { category: "OnlyA" });
    await addItem(owner, b, { category: "OnlyB" });
    expect(await json(await call(owner, "GET", `/${a}/categories`))).toEqual(["OnlyA"]);
  });
});

describe("sharing", () => {
  it("joins with a lowercase / padded code and is idempotent when joining twice", async () => {
    const listId = await newList(owner, "Shared");
    const code = await inviteCode(owner, listId);
    const first = await call(member, "POST", "/join", { code: ` ${code.toLowerCase()} ` });
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({ id: listId, role: "member", memberCount: 2 });
    const second = await call(member, "POST", "/join", { code });
    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({ id: listId, role: "member", memberCount: 2 });
    expect((await detail(owner, listId)).members).toHaveLength(2);
  });

  it("the owner joining their own list keeps the owner role", async () => {
    const listId = await newList(owner);
    const code = await inviteCode(owner, listId);
    expect(await json(await call(owner, "POST", "/join", { code }))).toMatchObject({ id: listId, role: "owner", memberCount: 1 });
  });

  it("rotating the invite invalidates the old code; the new one works", async () => {
    const listId = await newList(owner);
    const oldCode = await inviteCode(owner, listId);
    const newCode = await inviteCode(owner, listId);
    expect(newCode).not.toBe(oldCode);
    expect((await call(member, "POST", "/join", { code: oldCode })).status).toBe(404);
    expect((await call(member, "POST", "/join", { code: newCode })).status).toBe(200);
    // already-joined members survive a rotation
    await inviteCode(owner, listId);
    expect((await detail(member, listId)).list.role).toBe("member");
  });

  it("members see shared items and can add, edit and delete them", async () => {
    const listId = await newList(owner);
    await call(member, "POST", "/join", { code: await inviteCode(owner, listId) });
    const item = await addItem(member, listId, { name: "Eggs" });
    expect((await detail(owner, listId)).items).toMatchObject([{ id: item.id, name: "Eggs" }]);
    expect((await call(member, "PATCH", `/${listId}/items/${item.id}`, { missing: false })).status).toBe(200);
    expect((await call(owner, "DELETE", `/${listId}/items/${item.id}`)).status).toBe(204);
    expect((await detail(member, listId)).items).toEqual([]);
  });

  it("owner cannot remove themselves (400), even when alone; the list survives", async () => {
    const listId = await newList(owner);
    const { ownerId } = (await detail(owner, listId)).list;
    const res = await call(owner, "DELETE", `/${listId}/members/${ownerId}`);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/owner/);
    expect((await detail(owner, listId)).members).toHaveLength(1);
  });

  it("a member can leave; afterwards the list is 404 and gone from GET /lists", async () => {
    const listId = await newList(owner);
    await call(member, "POST", "/join", { code: await inviteCode(owner, listId) });
    const memberId = (await detail(member, listId)).members.find((m: any) => m.role === "member").userId;
    expect((await call(member, "DELETE", `/${listId}/members/${memberId}`)).status).toBe(204);
    expect((await call(member, "DELETE", `/${listId}/members/${memberId}`)).status).toBe(404); // already gone
    expect((await call(member, "GET", `/${listId}`)).status).toBe(404);
    expect((await json(await call(member, "GET", ""))).map((l: any) => l.id)).not.toContain(listId);
    expect((await detail(owner, listId)).list.memberCount).toBe(1);
  });

  it("a removed member loses every list route and cannot rejoin with a rotated-out code", async () => {
    const listId = await newList(owner);
    const oldCode = await inviteCode(owner, listId);
    await call(member, "POST", "/join", { code: oldCode });
    const item = await addItem(owner, listId, { name: "Milk" });
    const memberId = (await detail(owner, listId)).members.find((m: any) => m.role === "member").userId;
    expect((await call(owner, "DELETE", `/${listId}/members/${memberId}`)).status).toBe(204);
    await inviteCode(owner, listId);

    expect((await call(member, "GET", `/${listId}`)).status).toBe(404);
    expect((await call(member, "GET", `/${listId}/categories`)).status).toBe(404);
    expect((await call(member, "POST", `/${listId}/items`, { name: "x", category: "y" })).status).toBe(404);
    expect((await call(member, "PATCH", `/${listId}/items/${item.id}`, { name: "x" })).status).toBe(404);
    expect((await call(member, "DELETE", `/${listId}/items/${item.id}`)).status).toBe(404);
    expect((await call(member, "POST", `/${listId}/invite`)).status).toBe(404);
    expect((await call(member, "POST", "/join", { code: oldCode })).status).toBe(404);
  });

  it("a member cannot remove another member (403) or rename (403); owner removing an unknown user is 404", async () => {
    const listId = await newList(owner);
    const code = await inviteCode(owner, listId);
    await call(member, "POST", "/join", { code });
    await call(third, "POST", "/join", { code });
    const { members } = await detail(owner, listId);
    const thirdId = members.find((m: any) => m.email === "third@edge.test").userId;
    expect((await call(member, "DELETE", `/${listId}/members/${thirdId}`)).status).toBe(403);
    expect((await call(member, "PATCH", `/${listId}`, { name: "Mine" })).status).toBe(403);
    expect((await call(owner, "DELETE", `/${listId}/members/no-such-user`)).status).toBe(404);
    expect((await detail(owner, listId)).members).toHaveLength(3);
    expect((await call(owner, "DELETE", `/${listId}/members/${thirdId}`)).status).toBe(204);
  });

  it("members get full member info and the owner is listed", async () => {
    const listId = await newList(owner);
    await call(member, "POST", "/join", { code: await inviteCode(owner, listId) });
    const { members } = await detail(member, listId);
    expect(members).toHaveLength(2);
    expect(members).toContainEqual(expect.objectContaining({ name: "Owner", email: "owner@edge.test", role: "owner" }));
    expect(members).toContainEqual(expect.objectContaining({ name: "Member", email: "member@edge.test", role: "member" }));
  });

  it("owner rename validates the name and returns the updated list", async () => {
    const listId = await newList(owner);
    expect((await call(owner, "PATCH", `/${listId}`, { name: "" })).status).toBe(400);
    expect((await call(owner, "PATCH", `/${listId}`, { name: "x".repeat(201) })).status).toBe(400);
    expect(await json(await call(owner, "PATCH", `/${listId}`, { name: " New " }))).toMatchObject({ id: listId, name: "New", role: "owner" });
  });
});

describe("updatedAt", () => {
  it("is bumped by every item mutation, join, rotate and member removal", async () => {
    const listId = await newList(owner);
    const stamp = async () => Date.parse((await detail(owner, listId)).list.updatedAt);
    let last = await stamp();
    const bumped = async (label: string, fn: () => unknown) => {
      await sleep();
      await fn();
      const now = await stamp();
      expect(now, label).toBeGreaterThan(last);
      last = now;
    };
    let item: any;
    await bumped("item create", async () => (item = await addItem(owner, listId, { name: "a" })));
    await bumped("item patch", () => call(owner, "PATCH", `/${listId}/items/${item.id}`, { missing: false }));
    await bumped("item delete", () => call(owner, "DELETE", `/${listId}/items/${item.id}`));
    await bumped("rotate", () => inviteCode(owner, listId));
    const code = await inviteCode(owner, listId);
    await bumped("join", () => call(member, "POST", "/join", { code }));
    const memberId = (await detail(owner, listId)).members.find((m: any) => m.role === "member").userId;
    await bumped("remove member", () => call(owner, "DELETE", `/${listId}/members/${memberId}`));
  });

  it("is not bumped by failed mutations or re-joining", async () => {
    const listId = await newList(owner);
    const code = await inviteCode(owner, listId);
    await call(member, "POST", "/join", { code });
    const before = (await detail(owner, listId)).list.updatedAt;
    await sleep();
    await call(owner, "PATCH", `/${listId}/items/nope`, { name: "x" });
    await call(owner, "DELETE", `/${listId}/items/nope`);
    await call(owner, "POST", `/${listId}/items`, { name: "" });
    await call(member, "POST", "/join", { code });
    expect((await detail(owner, listId)).list.updatedAt).toBe(before);
  });
});

describe("GET /lists", () => {
  it("returns lists oldest first and does not auto-create once a list exists", async () => {
    const fresh = await signUp("fresh@edge.test", "Fresh");
    const a = await newList(fresh, "First");
    await sleep();
    const b = await newList(fresh, "Second");
    const lists = await json(await call(fresh, "GET", ""));
    expect(lists.map((l: any) => l.id)).toEqual([a, b]);
  });

  it("auto-creates My list once for a brand-new user", async () => {
    const fresh = await signUp("fresh2@edge.test", "Fresh2");
    const first = await json(await call(fresh, "GET", ""));
    const second = await json(await call(fresh, "GET", ""));
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
  });
});
