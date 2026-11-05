import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { found, unexpected } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { layout, notFound, notice } from "#/pages/layout.ts";
import { promotionPage, promotionsPage } from "#/pages/promotions.ts";

// The filter form's values; the private app checks the rest (a kind it does not know, say) and says why.
const filterQuery = z.object({
  chain: z.string().max(ID.maxLength).optional(),
  store: z.string().max(ID.maxLength).optional(),
  kind: z.string().max(20).optional(),
  state: z.string().max(20).optional(),
  page: z.string().regex(/^\d{1,6}$/).optional(),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Every Chain's Promotions grouped across its stores, and one Promotion, from the private app (it decides the states). */
export const promotionsRoutes = new Hono<AppEnv>()
  .get("/promotions", async (c) => {
    // The form sends an empty value for All Chains, All stores and Any kind; hc leaves undefined ones out.
    const query = filterQuery.safeParse(Object.fromEntries(Object.entries(c.req.query()).filter(([, v]) => v !== "")));
    if (!query.success) return c.html(layout("Promotions", notice("This filter is not one the form offers."), "promotions"), 400);
    const { api } = c.var.deps;
    const [res, chainsRes] = await Promise.all([api.promotions.$get({ query: query.data }), api.chains.$get()]);
    if (res.status === 404) return c.html(notFound("No store with this id."), 404);
    if (res.status === 400) return c.html(layout("Promotions", notice((await res.json()).error), "promotions"), 400);
    if (res.status !== 200) throw unexpected(res, "GET /promotions");
    if (chainsRes.status !== 200) throw unexpected(chainsRes, "GET /chains");
    return c.html(layout("Promotions", promotionsPage(await res.json(), (await chainsRes.json()).chains, query.data, c.var.deps.now()), "promotions"));
  })
  .get("/promotions/:id", async (c) => {
    const param = idParam.safeParse(c.req.param());
    const detail = param.success && (await found(await c.var.deps.api.promotions[":id"].$get({ param: { id: String(param.data.id) } }), "GET /promotions/:id"));
    if (!detail) return c.html(notFound("No Promotion with this id."), 404);
    return c.html(layout(detail.promotion.description, promotionPage(detail, c.var.deps.now()), "promotions"));
  });
