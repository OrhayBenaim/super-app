import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { promotionKinds } from "#/db/appSchema.ts";
import type { AppEnv } from "#/middleware.ts";
import { LIST_STATES, promotionDetail, promotionList } from "#/prices/promotion-list.ts";
import { bad, paramOf } from "#/routes/internal/valid.ts";

const listQuery = z.object({
  chain: z.string().min(1).max(ID.maxLength).optional(),
  store: z.string().min(1).max(ID.maxLength).optional(),
  kind: z.enum(promotionKinds).optional(),
  state: z.enum(LIST_STATES).default("running"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

/** The Internal dashboard's Promotions, on the private app: every Chain's, grouped across its stores, and one with its Products. Read-only. */
export const promotionsRoutes = new Hono<AppEnv>()
  .get("/", (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    const list = promotionList(c.var.deps.db, query.data, c.var.deps.clock.now());
    return list ? c.json(list, 200) : c.json({ error: "not found" }, 404);
  })
  .get("/:id", paramOf(idParam), (c) => {
    const detail = promotionDetail(c.var.deps.db, c.req.valid("param").id, c.var.deps.clock.now());
    return detail ? c.json(detail, 200) : c.json({ error: "not found" }, 404);
  });
