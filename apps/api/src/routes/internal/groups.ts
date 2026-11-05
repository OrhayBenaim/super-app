import { Hono, type Context } from "hono";
import { z } from "zod";
import { GROUP, GROUP_MEASURES } from "@grocer/shared/groups";
import { ID } from "@grocer/shared/ids";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import {
  createMadeGroup, deleteMadeGroup, groupDetail, groupList, renameGroup, setMember, updateMadeGroup, type Refusal,
} from "#/prices/group-edits.ts";
import { groupRefSchema, madeId } from "#/prices/groups.ts";
import { jsonBody, paramOf, queryOf } from "#/routes/internal/valid.ts";

const listQuery = z.object({
  q: z.string().trim().min(1).max(SEARCH.maxLength).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
const refParam = paramOf(z.object({ ref: groupRefSchema }));
const code = z.string().trim().min(1).max(ID.maxLength);
const name = z.string().trim().min(1).max(GROUP.nameMaxLength);
// A unit group's pack count is part of its measure; a kilo or liter group's is 1.
const madeBody = z
  .object({
    name,
    productType: z.enum(PRODUCT_TYPES),
    measure: z.enum(GROUP_MEASURES),
    size: z.number().int().min(GROUP.packCount.min).max(GROUP.packCount.max).optional(),
    codes: z.array(code).max(500).default([]),
  })
  .refine((b) => (b.measure === "unit" ? b.size !== undefined : (b.size ?? 1) === 1), "size is the pack count of a unit group only")
  .transform((b) => ({ ...b, size: b.size ?? 1 }));

const REFUSED: Record<Refusal, [string, 400 | 404]> = {
  "no group": ["not found", 404],
  "no product": ["no such Product", 404],
  "other measure": ["a Product measured another way than the group", 400],
};
const refused = (c: Context<AppEnv>, r: Refusal) => c.json({ error: REFUSED[r][0] }, REFUSED[r][1]);
/** An edit's answer: its refusal, or ok when `r` is null. */
const editAnswer = (c: Context<AppEnv>, r: Refusal | null) => (r ? refused(c, r) : c.json({ ok: true }, 200));

/**
 * The Internal dashboard's Product groups, on the private app (docs/adr/0007): the groups by Product type, one group,
 * and the team's edits.
 */
export const groupsRoutes = new Hono<AppEnv>()
  // A Product type's groups, those whose names hold q only, a page at a time.
  .get("/types/:type", paramOf(z.object({ type: z.enum(PRODUCT_TYPES) })), queryOf(listQuery), (c) =>
    c.json(groupList(c.var.deps.db, { ...c.req.valid("query"), type: c.req.valid("param").type }), 200),
  )
  .post("/", jsonBody(madeBody), (c) => {
    const made = createMadeGroup(c.var.deps.db, c.req.valid("json"));
    return typeof made === "string" ? refused(c, made) : c.json(made, 201);
  })
  .get("/:ref", refParam, (c) => {
    const detail = groupDetail(c.var.deps.db, c.req.valid("param").ref);
    return detail ? c.json(detail, 200) : c.json({ error: "not found" }, 404);
  })
  .put("/:ref", refParam, jsonBody(madeBody), (c) => {
    const { ref } = c.req.valid("param");
    if (madeId(ref) === null) return c.json({ error: "only a Made group is changed this way" }, 400);
    return editAnswer(c, updateMadeGroup(c.var.deps.db, ref, c.req.valid("json")));
  })
  .delete("/:ref", refParam, (c) => {
    const { ref } = c.req.valid("param");
    if (madeId(ref) === null) return c.json({ error: "only a Made group is deleted" }, 400);
    return deleteMadeGroup(c.var.deps.db, ref) ? c.json({ ok: true }, 200) : c.json({ error: "not found" }, 404);
  })
  .put("/:ref/name", refParam, jsonBody(z.object({ name })), (c) =>
    editAnswer(c, renameGroup(c.var.deps.db, c.req.valid("param").ref, c.req.valid("json").name)),
  )
  .post("/:ref/products", refParam, jsonBody(z.object({ code })), (c) =>
    editAnswer(c, setMember(c.var.deps.db, c.req.valid("param").ref, c.req.valid("json").code, true)),
  )
  .delete("/:ref/products/:code", paramOf(z.object({ ref: groupRefSchema, code })), (c) => {
    const { ref, code } = c.req.valid("param");
    return editAnswer(c, setMember(c.var.deps.db, ref, code, false));
  });
