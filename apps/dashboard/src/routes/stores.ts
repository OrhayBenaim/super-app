import { Hono, type Context } from "hono";
import { html } from "hono/html";
import { z } from "zod";
import type { AppEnv } from "#/middleware.ts";
import { layout } from "#/pages/layout.ts";
import { storeHref, storePage, storesPage } from "#/pages/stores.ts";

// The private app validates the edit (and says why it refuses one); here only the form's text becomes numbers or none.
const editForm = z.object({ name: z.string().catch(""), address: z.string().catch(""), city: z.string().catch(""), lat: z.string().catch(""), lng: z.string().catch("") });
const coordinate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().nullable());

const notFound = (c: Context<AppEnv>) => c.html(layout("Store not found", html`<p class="notice busy">No store with this id.</p>`), 404);

/** One store from the private app, or null when there is none. */
async function storeDetail(c: Context<AppEnv>, id: string) {
  const res = await c.var.deps.api.stores[":id"].$get({ param: { id } });
  const { status } = res;
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`api GET /stores/:id answered ${String(status)}`);
  return (await res.json()).store;
}

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
    const store = await storeDetail(c, c.req.param("id"));
    return store ? c.html(layout(store.name, storePage(store))) : notFound(c);
  })
  // The store's edit form: saved, it goes back to the store's page; refused, the page shows why with what was typed.
  .post("/stores/:id", async (c) => {
    const id = c.req.param("id");
    const edit = editForm.parse(await c.req.parseBody().catch(() => ({})));
    const lat = coordinate.safeParse(edit.lat);
    const lng = coordinate.safeParse(edit.lng);
    let error = "Latitude and longitude must be numbers.";
    if (lat.success && lng.success) {
      const res = await c.var.deps.api.stores[":id"].$put({ param: { id }, json: { name: edit.name, address: edit.address, city: edit.city, lat: lat.data, lng: lng.data } });
      const { status } = res;
      if (res.status === 200) return c.redirect(storeHref(id), 303);
      if (res.status === 404) return notFound(c);
      if (res.status !== 400) throw new Error(`api PUT /stores/:id answered ${String(status)}`);
      error = (await res.json()).error;
    }
    const store = await storeDetail(c, id);
    return store ? c.html(layout(store.name, storePage(store, { edit, error })), 400) : notFound(c);
  });
