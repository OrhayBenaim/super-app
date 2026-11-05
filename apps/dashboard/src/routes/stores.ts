import { Hono, type Context } from "hono";
import { z } from "zod";
import { ID } from "@grocer/shared/ids";
import { found, unexpected } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import { layout, notFound, notice } from "#/pages/layout.ts";
import { storeHref, storePage, storesPage } from "#/pages/stores.ts";

// As the private app's: an id it would refuse names no store.
const idParam = z.object({ id: z.string().min(1).max(ID.maxLength) });
// The filter form's values; the private app checks the rest (a page past the last, say) and says why.
const flag = z.enum(["true", "false"]).optional();
const filterQuery = z.object({ chain: z.string().max(ID.maxLength).optional(), noLocation: flag, publishedDiffers: flag, page: z.string().regex(/^\d{1,6}$/).optional() });
// The private app validates the edit (and says why it refuses one); here only the form's text becomes numbers or none.
const editForm = z.object({ name: z.string().catch(""), address: z.string().catch(""), city: z.string().catch(""), lat: z.string().catch(""), lng: z.string().catch("") });
const coordinate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().nullable());

const missing = (c: Context<AppEnv>) => c.html(notFound("No store with this id."), 404);
const refused = (c: Context<AppEnv>, text: string) => c.html(layout("Stores", notice(text)), 400);

/** One store from the private app, or null when there is none. */
async function storeDetail(c: Context<AppEnv>, id: string) {
  return (await found(await c.var.deps.api.stores[":id"].$get({ param: { id } }), "GET /stores/:id"))?.store ?? null;
}

export const storesRoutes = new Hono<AppEnv>()
  .get("/stores", async (c) => {
    // The form sends an empty value for All Chains; hc leaves undefined ones out.
    const query = filterQuery.safeParse(Object.fromEntries(Object.entries(c.req.query()).filter(([, v]) => v !== "")));
    if (!query.success) return refused(c, "This filter is not one the form offers.");
    const filter = query.data;
    const { api } = c.var.deps;
    const [res, chainsRes] = await Promise.all([api.stores.$get({ query: filter }), api.chains.$get()]);
    if (res.status === 400) return refused(c, (await res.json()).error);
    if (res.status !== 200) throw unexpected(res, "GET /stores");
    if (chainsRes.status !== 200) throw unexpected(chainsRes, "GET /chains");
    return c.html(layout("Stores", storesPage(await res.json(), (await chainsRes.json()).chains, filter)));
  })
  .get("/stores/:id", async (c) => {
    const param = idParam.safeParse(c.req.param());
    const store = param.success && (await storeDetail(c, param.data.id));
    return store ? c.html(layout(store.name, storePage(store))) : missing(c);
  })
  // The store's edit form: saved, it goes back to the store's page; refused, the page shows why with what was typed.
  .post("/stores/:id", async (c) => {
    const param = idParam.safeParse(c.req.param());
    if (!param.success) return missing(c);
    const { id } = param.data;
    const edit = editForm.parse(await c.req.parseBody().catch(() => ({})));
    const lat = coordinate.safeParse(edit.lat);
    const lng = coordinate.safeParse(edit.lng);
    let error = "Latitude and longitude must be numbers.";
    if (lat.success && lng.success) {
      const res = await c.var.deps.api.stores[":id"].$put({ param: { id }, json: { name: edit.name, address: edit.address, city: edit.city, lat: lat.data, lng: lng.data } });
      if (res.status === 200) return c.redirect(storeHref(id), 303);
      if (res.status === 404) return missing(c);
      if (res.status !== 400) throw unexpected(res, "PUT /stores/:id");
      error = (await res.json()).error;
    }
    const store = await storeDetail(c, id);
    return store ? c.html(layout(store.name, storePage(store, { edit, error })), 400) : missing(c);
  });
