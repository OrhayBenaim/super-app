import { Hono } from "hono";
import { z } from "zod";
import { SEARCH } from "@grocer/shared/search";
import type { AppEnv } from "#/middleware.ts";
import { groupMembers, measureOf, soldByOf } from "#/prices/groups.ts";
import { searchProducts } from "#/prices/search.ts";
import { bad } from "#/routes/internal/valid.ts";

const wordsQuery = z.object({ q: z.string().trim().min(SEARCH.minLength).max(100) });

/** The Internal dashboard's Product groups, on the private app: the app's search groups and Compare's members, read-only. */
export const groupsRoutes = new Hono<AppEnv>()
  // The groups the words name, as the app's search returns them, each with its members (the products Compare picks
  // from) that some store prices, cheapest per kilo or liter (per pack for a unit group) first.
  .get("/", (c) => {
    const query = wordsQuery.safeParse(c.req.query());
    if (!query.success) return bad(c, query.error);
    const { db } = c.var.deps;
    const priced = db.$client.prepare("SELECT min(price) AS minPrice, count(*) AS storeCount FROM prices WHERE code = ?");
    const groups = searchProducts(db, query.data.q, 0).flatMap((found) => {
      if (found.kind !== "group") return [];
      const { kind: _, ...g } = found;
      const members = groupMembers(db, g.ref).members.flatMap((p) => {
        const { minPrice, storeCount } = priced.get(p.code) as { minPrice: number | null; storeCount: number };
        if (minPrice === null) return [];
        return [{ code: p.code, name: p.name, ...measureOf(p)!, soldBy: soldByOf(p), minPrice, storeCount }];
      });
      const per = (m: (typeof members)[number]) => (g.measure === "unit" ? m.minPrice : m.minPrice / m.size);
      return [{ ...g, members: members.sort((a, b) => per(a) - per(b) || a.name.localeCompare(b.name)) }];
    });
    return c.json({ groups }, 200);
  });
