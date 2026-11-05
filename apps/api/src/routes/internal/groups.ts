import { Hono } from "hono";
import { z } from "zod";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import { groupsWithMembers } from "#/prices/products.ts";
import { bad } from "#/routes/internal/valid.ts";

const wordsQuery = z.object({ q: z.string().trim().min(SEARCH.minLength).max(100) });

/** The Internal dashboard's Product groups, on the private app: the app's search groups and Compare's members, read-only. */
export const groupsRoutes = new Hono<AppEnv>()
  // The groups the words name, as the app's search returns them, each with its priced members, cheapest first.
  .get("/", (c) => {
    const query = wordsQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    return c.json({ groups: groupsWithMembers(c.var.deps.db, query.data.q) }, 200);
  });
