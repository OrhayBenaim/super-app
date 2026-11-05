import { Hono } from "hono";
import { html } from "hono/html";
import type { AppEnv } from "#/middleware.ts";
import { layout } from "#/pages/layout.ts";
import { promotionPage, storePromotionsPage } from "#/pages/promotions.ts";

const notFound = (text: string) => layout("Not found", html`<p class="notice busy">${text}</p>`);

/** A store's Promotions and one Promotion's Products, from the private app (it validates the ids and decides the states). */
export const promotionsRoutes = new Hono<AppEnv>()
  .get("/stores/:id/promotions", async (c) => {
    const res = await c.var.deps.api.promotions.$get({ query: { store: c.req.param("id") } });
    const { status } = res;
    if (res.status === 404) return c.html(notFound("No store with this id."), 404);
    if (res.status !== 200) throw new Error(`api GET /promotions answered ${String(status)}`);
    const list = await res.json();
    return c.html(layout(`${list.store.name} Promotions`, storePromotionsPage(list)));
  })
  .get("/promotions/:id", async (c) => {
    const res = await c.var.deps.api.promotions[":id"].$get({ param: { id: c.req.param("id") } });
    const { status } = res;
    // A malformed id names no Promotion either.
    if (res.status === 404 || res.status === 400) return c.html(notFound("No Promotion with this id."), 404);
    if (res.status !== 200) throw new Error(`api GET /promotions/:id answered ${String(status)}`);
    const detail = await res.json();
    return c.html(layout(detail.promotion.description, promotionPage(detail)));
  });
