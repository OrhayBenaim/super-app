import { Hono } from "hono";
import { html } from "hono/html";
import { z } from "zod";
import { SEARCH } from "@grocer/shared/search";
import { unexpected } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { groupSection, groupsPage } from "#/pages/groups.ts";
import { layout, notice } from "#/pages/layout.ts";

const wordsQuery = z.object({ q: z.string().trim().max(SEARCH.maxLength).default("") });

/** Product groups from the private app's group search, read-only. Any answer other than 200 is a bug: onError shows it. */
export const groupsRoutes = new Hono<AppEnv>().get("/groups", async (c) => {
  const query = wordsQuery.safeParse(c.req.query());
  if (!query.success) return c.html(layout("Product groups", groupsPage("", notice(`Group words are at most ${SEARCH.maxLength} characters.`))), 400);
  const { q } = query.data;
  if (!q) return c.html(layout("Product groups", groupsPage(q)));
  if (q.length < SEARCH.minLength) return c.html(layout("Product groups", groupsPage(q, notice(`Type at least ${SEARCH.minLength} characters.`))));
  const res = await c.var.deps.api.groups.$get({ query: { q } });
  if (res.status !== 200) throw unexpected(res, "GET /groups");
  const { groups } = await res.json();
  if (!groups.length) return c.html(layout("Product groups", groupsPage(q, notice(`No Product group starts with “${q}”.`))));
  return c.html(layout("Product groups", groupsPage(q, html`${groups.map(groupSection)}`)));
});
