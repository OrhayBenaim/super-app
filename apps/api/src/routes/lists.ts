import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { DEFAULT_LIST_NAME } from "@grocer/shared/lists";
import { isValidQuantity, QUANTITY, type SoldBy } from "@grocer/shared/quantity";
import type { Db } from "#/db/index.ts";
import { items, listMembers, lists, products, user } from "#/db/schema.ts";
import type { Deps } from "#/deps.ts";
import { groupMembers, groupRefSchema, soldByOf } from "#/prices/groups.ts";
import { requireUser, type AppEnv } from "#/middleware.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I; 256 % 32 == 0 so no modulo bias
const newCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

const nameBody = z.object({ name: z.string().trim().min(1).max(200) });
const itemFields = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  productCode: z.string().trim().min(1).max(64).nullable().optional(),
  groupRef: groupRefSchema.nullable().optional(),
  missing: z.boolean().optional(),
  quantity: z.number().positive().max(QUANTITY.max).optional(), // checked against the item's sold-by in the handler
});
// An item is matched to one product or one Product group, never both.
const oneMatch = [(b: { productCode?: string | null; groupRef?: string | null }) => !(b.productCode && b.groupRef), "send productCode or groupRef, not both"] as const;
const itemBody = itemFields.refine(...oneMatch);
const itemPatch = itemFields.partial().refine(...oneMatch);
const joinBody = z.object({ code: z.string().trim().min(1).max(32) });

async function parse<T extends z.ZodType>(c: Context<AppEnv>, schema: T) {
  return schema.safeParse(await c.req.json().catch(() => undefined));
}
const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid body" }, 400);
const notFound = (c: Context<AppEnv>) => c.json({ error: "not found" }, 404);
const badQuantity = (c: Context<AppEnv>, soldBy: SoldBy) => c.json({ error: `invalid quantity for an item sold by ${soldBy}` }, 400);

type Match = { productCode: string | null; groupRef: string | null };
/** How an item is sold, from its matched product or Product group; unmatched items (and unknown codes) by the unit. */
function soldByOfItem(db: Db, { productCode, groupRef }: Match): SoldBy {
  if (groupRef) return groupMembers(db, groupRef).soldBy;
  const p = productCode && db.select({ unitQty: products.unitQty, isWeighted: products.isWeighted }).from(products).where(eq(products.code, productCode)).get();
  return p ? soldByOf(p) : "unit";
}

const listSelect = {
  id: lists.id,
  name: lists.name,
  ownerId: lists.ownerId,
  role: listMembers.role,
  memberCount: sql<number>`(select count(*) from ${listMembers} m where m.list_id = ${lists.id})`,
  updatedAt: lists.updatedAt,
};
const listFor = (db: Db, userId: string, listId?: string) =>
  db
    .select(listSelect)
    .from(lists)
    .innerJoin(listMembers, and(eq(listMembers.listId, lists.id), eq(listMembers.userId, userId)))
    .where(listId ? eq(lists.id, listId) : undefined)
    .orderBy(asc(lists.createdAt))
    .all();
const oneList = (db: Db, userId: string, listId: string) => listFor(db, userId, listId)[0];

const roleOf = (db: Db, listId: string, userId: string) =>
  db
    .select({ role: listMembers.role })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    .get()?.role;

const touch = ({ db, clock }: Deps, listId: string) =>
  db.update(lists).set({ updatedAt: clock.now() }).where(eq(lists.id, listId)).run();

function createList(db: Db, ownerId: string, name: string) {
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(lists).values({ id, name, ownerId, inviteCode: newCode() }).run();
    tx.insert(listMembers).values({ listId: id, userId: ownerId, role: "owner" }).run();
  });
  return oneList(db, ownerId, id);
}

export const listsRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", (c) => {
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const all = listFor(db, userId);
    return c.json(all.length ? all : [createList(db, userId, DEFAULT_LIST_NAME)]);
  })
  .post("/", async (c) => {
    const p = await parse(c, nameBody);
    if (!p.success) return bad(c, p.error);
    return c.json(createList(c.var.deps.db, c.var.user.id, p.data.name));
  })
  .post("/join", async (c) => {
    const p = await parse(c, joinBody);
    if (!p.success) return bad(c, p.error);
    const { db } = c.var.deps;
    const userId = c.var.user.id;
    const list = db.select({ id: lists.id }).from(lists).where(eq(lists.inviteCode, p.data.code.toUpperCase())).get();
    if (!list) return notFound(c);
    const added = db.insert(listMembers).values({ listId: list.id, userId, role: "member" }).onConflictDoNothing().run();
    if (added.changes) touch(c.var.deps, list.id);
    return c.json(oneList(db, userId, list.id));
  })
  .get("/:id", (c) => {
    const { db } = c.var.deps;
    const id = c.req.param("id");
    const list = oneList(db, c.var.user.id, id);
    if (!list) return notFound(c);
    const members = db
      .select({ userId: listMembers.userId, name: user.name, email: user.email, role: listMembers.role })
      .from(listMembers)
      .innerJoin(user, eq(user.id, listMembers.userId))
      .where(eq(listMembers.listId, id))
      .all();
    // shortcut: a group item's sold-by runs a group search on every poll (once per distinct match); cache it per
    // group ref if list polling shows up as slow.
    const soldBy = new Map<string, SoldBy>();
    const rows = db.select().from(items).where(eq(items.listId, id)).orderBy(asc(items.createdAt)).all();
    const withSoldBy = rows.map((i) => {
      const key = `${i.productCode}|${i.groupRef}`;
      if (!soldBy.has(key)) soldBy.set(key, soldByOfItem(db, i));
      return { ...i, soldBy: soldBy.get(key)! };
    });
    return c.json({ list, members, items: withSoldBy });
  })
  .patch("/:id", async (c) => {
    const { db, clock } = c.var.deps;
    const id = c.req.param("id");
    const userId = c.var.user.id;
    const role = roleOf(db, id, userId);
    if (!role) return notFound(c);
    if (role !== "owner") return c.json({ error: "only the owner can rename the list" }, 403);
    const p = await parse(c, nameBody);
    if (!p.success) return bad(c, p.error);
    db.update(lists).set({ name: p.data.name, updatedAt: clock.now() }).where(eq(lists.id, id)).run();
    return c.json(oneList(db, userId, id));
  })
  .post("/:id/items", async (c) => {
    const { db } = c.var.deps;
    const listId = c.req.param("id");
    if (!roleOf(db, listId, c.var.user.id)) return notFound(c);
    const p = await parse(c, itemBody);
    if (!p.success) return bad(c, p.error);
    const { name, category, productCode = null, groupRef = null, missing = true, quantity = QUANTITY.start } = p.data;
    const soldBy = soldByOfItem(db, { productCode, groupRef });
    if (!isValidQuantity(quantity, soldBy)) return badQuantity(c, soldBy);
    const item = db.insert(items).values({ id: randomUUID(), listId, name, category, productCode, groupRef, missing, quantity }).returning().get();
    touch(c.var.deps, listId);
    return c.json({ ...item, soldBy });
  })
  .patch("/:id/items/:itemId", async (c) => {
    const { db, clock } = c.var.deps;
    const { id: listId, itemId } = c.req.param();
    if (!roleOf(db, listId, c.var.user.id)) return notFound(c);
    const p = await parse(c, itemPatch);
    if (!p.success) return bad(c, p.error);
    const where = and(eq(items.id, itemId), eq(items.listId, listId));
    const before = db.select().from(items).where(where).get();
    if (!before) return notFound(c);
    const other = p.data.productCode ? { groupRef: null } : p.data.groupRef ? { productCode: null } : {}; // matching one unmatches the other
    const next = { ...before, ...p.data, ...other };
    const rematched = next.productCode !== before.productCode || next.groupRef !== before.groupRef;
    const soldBy = soldByOfItem(db, next);
    // A quantity in kilos means nothing in units (and back): a change of sold-by starts over, unless the patch sets one.
    // Only a sent quantity is checked, so a stored one can never block checking the item off.
    const reset = rematched && (soldBy !== soldByOfItem(db, before) || !isValidQuantity(before.quantity, soldBy));
    const quantity = p.data.quantity ?? (reset ? QUANTITY.start : before.quantity);
    if (p.data.quantity !== undefined && !isValidQuantity(quantity, soldBy)) return badQuantity(c, soldBy);
    const item = db
      .update(items)
      .set({ ...p.data, ...other, quantity, updatedAt: clock.now() })
      .where(where)
      .returning()
      .get();
    if (!item) return notFound(c);
    touch(c.var.deps, listId);
    return c.json({ ...item, soldBy });
  })
  .delete("/:id/items/:itemId", (c) => {
    const { db } = c.var.deps;
    const { id: listId, itemId } = c.req.param();
    if (!roleOf(db, listId, c.var.user.id)) return notFound(c);
    const res = db.delete(items).where(and(eq(items.id, itemId), eq(items.listId, listId))).run();
    if (!res.changes) return notFound(c);
    touch(c.var.deps, listId);
    return c.body(null, 204);
  })
  .get("/:id/categories", (c) => {
    const { db } = c.var.deps;
    const listId = c.req.param("id");
    if (!roleOf(db, listId, c.var.user.id)) return notFound(c);
    const rows = db
      .select({ category: items.category })
      .from(items)
      .where(eq(items.listId, listId))
      .groupBy(items.category)
      .orderBy(desc(sql`count(*)`), asc(items.category))
      .all();
    return c.json(rows.map((r) => r.category));
  })
  .post("/:id/invite", (c) => {
    const { db, clock } = c.var.deps;
    const listId = c.req.param("id");
    if (!roleOf(db, listId, c.var.user.id)) return notFound(c);
    const code = newCode();
    db.update(lists).set({ inviteCode: code, updatedAt: clock.now() }).where(eq(lists.id, listId)).run();
    return c.json({ code, url: `grocer://join/${code}` });
  })
  .delete("/:id/members/:userId", (c) => {
    const { db } = c.var.deps;
    const { id: listId, userId: target } = c.req.param();
    const me = c.var.user.id;
    const role = roleOf(db, listId, me);
    if (!role) return notFound(c);
    if (role !== "owner" && target !== me) return c.json({ error: "only the owner can remove members" }, 403);
    const targetRole = target === me ? role : roleOf(db, listId, target);
    if (!targetRole) return notFound(c);
    if (targetRole === "owner") return c.json({ error: "the owner cannot leave or be removed" }, 400);
    db.delete(listMembers).where(and(eq(listMembers.listId, listId), eq(listMembers.userId, target))).run();
    touch(c.var.deps, listId);
    return c.body(null, 204);
  });
