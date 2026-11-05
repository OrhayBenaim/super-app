import { Hono } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { found } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { layout, notFound } from "#/pages/layout.ts";
import { promotionPage, storePromotionsPage } from "#/pages/promotions.ts";

// As the private app's: an id it would refuse names nothing.
const storeParam = z.object({ id: z.string().min(1).max(ID.maxLength) });
const idParam = z.object({ id: z.coerce.number().int().positive() });

/** A store's Promotions and one Promotion's Products, from the private app (it decides the states). */
export const promotionsRoutes = new Hono<AppEnv>()
  .get("/stores/:id/promotions", async (c) => {
    const param = storeParam.safeParse(c.req.param());
    const list = param.success && (await found(await c.var.deps.api.promotions.$get({ query: { store: param.data.id } }), "GET /promotions"));
    if (!list) return c.html(notFound("No store with this id."), 404);
    return c.html(layout(`${list.store.name} Promotions`, storePromotionsPage(list)));
  })
  .get("/promotions/:id", async (c) => {
    const param = idParam.safeParse(c.req.param());
    const detail = param.success && (await found(await c.var.deps.api.promotions[":id"].$get({ param: { id: String(param.data.id) } }), "GET /promotions/:id"));
    if (!detail) return c.html(notFound("No Promotion with this id."), 404);
    return c.html(layout(detail.promotion.description, promotionPage(detail)));
  });
