import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireUser, type AppEnv } from "../middleware.js";
import { db } from "../db/index.js";
import { items, listMembers, lists, user } from "../db/schema.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I; 256 % 32 == 0 so no modulo bias
const newCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

const nameBody = z.object({ name: z.string().trim().min(1).max(200) });
const itemBody = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  productCode: z.string().trim().min(1).max(64).nullable().optional(),
  missing: z.boolean().optional(),
});
const joinBody = z.object({ code: z.string().trim().min(1).max(32) });

async function parse<T extends z.ZodType>(c: Context<AppEnv>, schema: T) {
  return schema.safeParse(await c.req.json().catch(() => undefined));
}
const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid body" }, 400);
const notFound = (c: Context<AppEnv>) => c.json({ error: "not found" }, 404);

const listSelect = {
  id: lists.id,
  name: lists.name,
  ownerId: lists.ownerId,
  role: listMembers.role,
  memberCount: sql<number>`(select count(*) from ${listMembers} m where m.list_id = ${lists.id})`,
  updatedAt: lists.updatedAt,
};
const listFor = (userId: string, listId?: string) =>
  db
    .select(listSelect)
    .from(lists)
    .innerJoin(listMembers, and(eq(listMembers.listId, lists.id), eq(listMembers.userId, userId)))
    .where(listId ? eq(lists.id, listId) : undefined)
    .orderBy(asc(lists.createdAt))
    .all();
const oneList = (userId: string, listId: string) => listFor(userId, listId)[0];

const roleOf = (listId: string, userId: string) =>
  db
    .select({ role: listMembers.role })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    .get()?.role;

const touch = (listId: string) => db.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, listId)).run();

function createList(ownerId: string, name: string) {
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(lists).values({ id, name, ownerId, inviteCode: newCode() }).run();
    tx.insert(listMembers).values({ listId: id, userId: ownerId, role: "owner" }).run();
  });
  return oneList(ownerId, id);
}

export const listsRoutes = new Hono<AppEnv>();
listsRoutes.use("*", requireUser);

listsRoutes.get("/", (c) => {
  const userId = c.get("user").id;
  const all = listFor(userId);
  return c.json(all.length ? all : [createList(userId, "My list")]);
});

listsRoutes.post("/", async (c) => {
  const p = await parse(c, nameBody);
  if (!p.success) return bad(c, p.error);
  return c.json(createList(c.get("user").id, p.data.name));
});

listsRoutes.post("/join", async (c) => {
  const p = await parse(c, joinBody);
  if (!p.success) return bad(c, p.error);
  const userId = c.get("user").id;
  const list = db.select({ id: lists.id }).from(lists).where(eq(lists.inviteCode, p.data.code.toUpperCase())).get();
  if (!list) return notFound(c);
  const added = db.insert(listMembers).values({ listId: list.id, userId, role: "member" }).onConflictDoNothing().run();
  if (added.changes) touch(list.id);
  return c.json(oneList(userId, list.id));
});

listsRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  const list = oneList(c.get("user").id, id);
  if (!list) return notFound(c);
  const members = db
    .select({ userId: listMembers.userId, name: user.name, email: user.email, role: listMembers.role })
    .from(listMembers)
    .innerJoin(user, eq(user.id, listMembers.userId))
    .where(eq(listMembers.listId, id))
    .all();
  const rows = db.select().from(items).where(eq(items.listId, id)).orderBy(asc(items.createdAt)).all();
  return c.json({ list, members, items: rows });
});

listsRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;
  const role = roleOf(id, userId);
  if (!role) return notFound(c);
  if (role !== "owner") return c.json({ error: "only the owner can rename the list" }, 403);
  const p = await parse(c, nameBody);
  if (!p.success) return bad(c, p.error);
  db.update(lists).set({ name: p.data.name, updatedAt: new Date() }).where(eq(lists.id, id)).run();
  return c.json(oneList(userId, id));
});

listsRoutes.post("/:id/items", async (c) => {
  const listId = c.req.param("id");
  if (!roleOf(listId, c.get("user").id)) return notFound(c);
  const p = await parse(c, itemBody);
  if (!p.success) return bad(c, p.error);
  const { name, category, productCode = null, missing = true } = p.data;
  const item = db.insert(items).values({ id: randomUUID(), listId, name, category, productCode, missing }).returning().get();
  touch(listId);
  return c.json(item);
});

listsRoutes.patch("/:id/items/:itemId", async (c) => {
  const { id: listId, itemId } = c.req.param();
  if (!roleOf(listId, c.get("user").id)) return notFound(c);
  const p = await parse(c, itemBody.partial());
  if (!p.success) return bad(c, p.error);
  const item = db
    .update(items)
    .set({ ...p.data, updatedAt: new Date() })
    .where(and(eq(items.id, itemId), eq(items.listId, listId)))
    .returning()
    .get();
  if (!item) return notFound(c);
  touch(listId);
  return c.json(item);
});

listsRoutes.delete("/:id/items/:itemId", (c) => {
  const { id: listId, itemId } = c.req.param();
  if (!roleOf(listId, c.get("user").id)) return notFound(c);
  const res = db.delete(items).where(and(eq(items.id, itemId), eq(items.listId, listId))).run();
  if (!res.changes) return notFound(c);
  touch(listId);
  return c.body(null, 204);
});

listsRoutes.get("/:id/categories", (c) => {
  const listId = c.req.param("id");
  if (!roleOf(listId, c.get("user").id)) return notFound(c);
  const rows = db
    .select({ category: items.category })
    .from(items)
    .where(eq(items.listId, listId))
    .groupBy(items.category)
    .orderBy(desc(sql`count(*)`), asc(items.category))
    .all();
  return c.json(rows.map((r) => r.category));
});

listsRoutes.post("/:id/invite", (c) => {
  const listId = c.req.param("id");
  if (!roleOf(listId, c.get("user").id)) return notFound(c);
  const code = newCode();
  db.update(lists).set({ inviteCode: code, updatedAt: new Date() }).where(eq(lists.id, listId)).run();
  return c.json({ code, url: `grocer://join/${code}` });
});

listsRoutes.delete("/:id/members/:userId", (c) => {
  const { id: listId, userId: target } = c.req.param();
  const me = c.get("user").id;
  const role = roleOf(listId, me);
  if (!role) return notFound(c);
  if (role !== "owner" && target !== me) return c.json({ error: "only the owner can remove members" }, 403);
  const targetRole = target === me ? role : roleOf(listId, target);
  if (!targetRole) return notFound(c);
  if (targetRole === "owner") return c.json({ error: "the owner cannot leave or be removed" }, 400);
  db.delete(listMembers).where(and(eq(listMembers.listId, listId), eq(listMembers.userId, target))).run();
  touch(listId);
  return c.body(null, 204);
});
