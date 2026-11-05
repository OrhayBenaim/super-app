import { Hono } from "hono";
import { html } from "hono/html";
import type { AppEnv } from "#/middleware.ts";
import { layout } from "#/pages/layout.ts";
import { storePage, storesPage } from "#/pages/stores.ts";

// The private app validates the filter (zod there, 400 on a bad one); the dashboard passes it on and shows the refusal.
export const storesRoutes = new Hono<AppEnv>()
  .get("/stores", async (c) => {
    // The form sends an empty value for All Chains; hc leaves undefined ones out.
    const { chain = undefined, noLocation, publishedDiffers, page } = Object.fromEntries(Object.entries(c.req.query()).filter(([, v]) => v !== ""));
    const { api } = c.var.deps;
    const [res, chainsRes] = await Promise.all([api.stores.$get({ query: { chain, noLocation, publishedDiffers, page } }), api.chains.$get()]);
    const { status } = res;
    if (res.status === 400) return c.html(layout("Stores", html`<p class="notice busy">${(await res.json()).error}</p>`), 400);
    if (res.status !== 200) throw new Error(`api GET /stores answered ${String(status)}`);
    if (chainsRes.status !== 200) throw new Error(`api GET /chains answered ${chainsRes.status}`);
    return c.html(layout("Stores", storesPage(await res.json(), (await chainsRes.json()).chains, { chain, noLocation, publishedDiffers })));
  })
  .get("/stores/:id", async (c) => {
    const res = await c.var.deps.api.stores[":id"].$get({ param: { id: c.req.param("id") } });
    const { status } = res;
    if (res.status === 404) return c.html(layout("Store not found", html`<p class="notice busy">No store with this id.</p>`), 404);
    if (res.status !== 200) throw new Error(`api GET /stores/:id answered ${String(status)}`);
    const { store } = await res.json();
    return c.html(layout(store.name, storePage(store)));
  });
