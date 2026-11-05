import { Hono, type Context } from "hono";
import { html } from "hono/html";
import { z } from "zod";
import { GROUP, GROUP_MEASURES } from "@grocer/shared/groups";
import { ID } from "@grocer/shared/ids";
import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import { found, unexpected } from "#/api-client.ts";
import type { AppEnv } from "#/middleware.ts";
import {
  draftResults, groupFound, groupHref, groupsPage, newGroupForm, openGroup, PAGE_SIZE, pickedList, type Draft, type DraftErrors, type Found, type Picked,
} from "#/pages/groups.ts";
import { layout, notFound, notice } from "#/pages/layout.ts";

type C = Context<AppEnv>;
// Anything outside these reads as none: no type, the first page, no search.
const words = z.string().trim().max(SEARCH.maxLength).catch("");
const listQuery = z.object({
  type: z.enum(PRODUCT_TYPES).optional().catch(undefined),
  q: words,
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  ref: z.string().trim().min(1).max(200).optional().catch(undefined),
});
const nameField = z.string().trim().min(1, "Give the group a name.").max(GROUP.nameMaxLength, `At most ${GROUP.nameMaxLength} characters.`);
const { min, max } = GROUP.packCount;
const packCount = z.coerce.number().int().min(min).max(max);
const code = z.string().trim().min(1).max(ID.maxLength);
const pickedItem = z.object({
  code,
  name: z.string().max(300).catch(""),
  measure: z.enum(GROUP_MEASURES).nullable().catch(null),
  size: z.number().nullable().catch(null),
  storeCount: z.number().int().min(0).catch(0),
  minPrice: z.number().min(0).catch(0),
});

/** A form body's fields, each as every value it was sent (an htmx post repeats `item`). */
async function formOf(c: C) {
  const body = await c.req.parseBody({ all: true }).catch(() => ({}));
  const all = (k: string) => [(body as Record<string, unknown>)[k]].flat().filter((v): v is string => typeof v === "string");
  return { all, one: (k: string) => all(k)[0] ?? "" };
}

/** A picked Product from the JSON the form carries, or none for one that is not. */
function pickedOf(json: string): Picked[] {
  try {
    const item = pickedItem.safeParse(JSON.parse(json));
    return item.success ? [item.data] : [];
  } catch {
    return [];
  }
}

async function groupList(c: C, type: ProductType, q: string, page: number) {
  const res = await c.var.deps.api.groups.types[":type"].$get({ param: { type }, query: { ...(q && { q }), page: String(page), pageSize: String(PAGE_SIZE) } });
  if (res.status !== 200) throw unexpected(res, "GET /groups/types/:type");
  return res.json();
}

// hc puts a param into the path as it is, so a ref (Hebrew words, "|") is encoded here.
const groupDetail = async (c: C, ref: string) => found(await c.var.deps.api.groups[":ref"].$get({ param: { ref: encodeURIComponent(ref) } }), "GET /groups/:ref");

/** The Products the dashboard's Product search finds for `q`, none for too few characters. */
async function search(c: C, q: string): Promise<Found[]> {
  if (q.length < SEARCH.minLength) return [];
  const res = await c.var.deps.api.products.$get({ query: { q } });
  if (res.status !== 200) throw unexpected(res, "GET /products");
  return (await res.json()).products;
}

/** The open group again after an edit, or the notice that it is gone. htmx swaps only a 2xx, so a refusal is a 200 too. */
async function panel(c: C, ref: string, p: Parameters<typeof openGroup>[1] = {}) {
  const detail = await groupDetail(c, ref);
  return c.html(detail ? openGroup(detail, p) : html`<div id="group">${notice("No such group. It may have been deleted: reload the page.")}</div>`);
}

/** An edit's answer: the open group, with the api's refusal (400, 404) above its Products. Anything else is a bug. */
async function edited(c: C, ref: string, res: { status: number; json(): Promise<unknown> }, call: string, p: Parameters<typeof openGroup>[1] = {}) {
  if (res.status === 200) return panel(c, ref, p);
  if (res.status !== 400 && res.status !== 404) throw unexpected(res, call);
  const body = (await res.json()) as { error?: string };
  return panel(c, ref, { ...p, error: `Not changed: ${body.error ?? "refused"}.` });
}

/** The new group form's fields, its Products with `add` added and `remove` removed, and its search. */
async function draftOf(c: C): Promise<Draft> {
  const { all, one } = await formOf(c);
  const items = new Map<string, Picked>();
  for (const p of [...all("item"), ...all("add")].flatMap(pickedOf)) items.set(p.code, p);
  for (const code of all("remove")) items.delete(code);
  const q = words.parse(one("q"));
  return {
    name: one("name"),
    productType: z.enum(PRODUCT_TYPES).catch(PRODUCT_TYPES[0]).parse(one("productType")),
    measure: z.enum(GROUP_MEASURES).catch("l").parse(one("measure")),
    size: one("size"),
    items: [...items.values()],
    q,
    found: await search(c, q),
  };
}

async function newGroupPage(c: C, draft: Draft, errors: DraftErrors = {}, status: 200 | 400 = 200) {
  const list = await groupList(c, draft.productType, "", 1);
  const page = groupsPage({ type: draft.productType, q: "", page: 1, list, draft: true, body: newGroupForm(draft, errors) });
  return c.html(layout("New group", page, "groups"), status);
}

/**
 * Product groups (A8, A9) on the private app's group endpoints (docs/adr/0007): a Product type's groups beside the open
 * one, its edits, and a new Made group. Any answer the pages do not expect is a bug: onError shows it.
 */
export const groupsRoutes = new Hono<AppEnv>()
  .get("/groups", async (c) => {
    const { type: asked, q, page, ref } = listQuery.parse(c.req.query());
    const detail = ref ? await groupDetail(c, ref) : null;
    if (ref && !detail) return c.html(notFound("No Product group with this ref."), 404);
    const type = asked ?? detail?.group.type ?? PRODUCT_TYPES[0];
    const list = await groupList(c, type, q, page);
    const first = list.groups[0];
    const open = detail ?? (first ? await groupDetail(c, first.ref) : null);
    const body = groupsPage({ type, q, page, list, ref: open?.group.ref, body: open ? openGroup(open) : "" });
    return c.html(layout(open?.group.name ?? "Product groups", body, "groups"));
  })
  .get("/groups/new", (c) => {
    const productType = listQuery.shape.type.parse(c.req.query("type")) ?? PRODUCT_TYPES[0];
    return newGroupPage(c, { name: "", productType, measure: "l", size: "", items: [], q: "", found: [] });
  })
  // The new group form's search, Add and Remove: its Products again, and the search results beside them.
  .post("/groups/new/draft", async (c) => {
    const d = await draftOf(c);
    return c.html(html`${pickedList(d.items, d.measure)}${draftResults(d.found, d.items, d.q, true)}`);
  })
  // Create group: a plain form post, so a refusal is the page again with what was typed.
  .post("/groups/new", async (c) => {
    const draft = await draftOf(c);
    const name = nameField.safeParse(draft.name);
    const size = draft.measure === "unit" ? packCount.safeParse(draft.size) : null;
    const errors: DraftErrors = {
      ...(!name.success && { name: name.error.issues[0]!.message }),
      ...(size && !size.success && { size: `A pack count from ${min} to ${max}.` }),
    };
    if (!name.success || (size && !size.success)) return newGroupPage(c, draft, errors, 400);
    const json = { name: name.data, productType: draft.productType, measure: draft.measure, size: size?.data ?? 1, codes: draft.items.map((p) => p.code) };
    const res = await c.var.deps.api.groups.$post({ json });
    if (res.status === 400 || res.status === 404) return newGroupPage(c, draft, { form: `Not created: ${(await res.json()).error}.` }, 400);
    if (res.status !== 201) throw unexpected(res, "POST /groups");
    return c.redirect(groupHref({ type: draft.productType, ref: (await res.json()).ref }), 303);
  })
  .post("/groups/:ref/name", async (c) => {
    const ref = c.req.param("ref");
    const name = nameField.safeParse((await formOf(c)).one("name"));
    if (!name.success) return panel(c, ref, { renameError: name.error.issues[0]!.message });
    const res = await c.var.deps.api.groups[":ref"].name.$put({ param: { ref: encodeURIComponent(ref) }, json: { name: name.data } });
    return edited(c, ref, res, "PUT /groups/:ref/name");
  })
  .post("/groups/:ref/remove", async (c) => {
    const ref = c.req.param("ref");
    const product = code.safeParse((await formOf(c)).one("code"));
    if (!product.success) return panel(c, ref, { error: "Not changed: no Product given." });
    const res = await c.var.deps.api.groups[":ref"].products[":code"].$delete({ param: { ref: encodeURIComponent(ref), code: encodeURIComponent(product.data) } });
    return edited(c, ref, res, "DELETE /groups/:ref/products/:code");
  })
  // Add keeps Add Products open on its search, so the next Product is one click away.
  .post("/groups/:ref/add", async (c) => {
    const ref = c.req.param("ref");
    const { one } = await formOf(c);
    const product = code.safeParse(one("code"));
    const q = words.parse(one("q"));
    const find = { q, found: await search(c, q) };
    if (!product.success) return panel(c, ref, { error: "Not changed: no Product given.", find });
    const res = await c.var.deps.api.groups[":ref"].products.$post({ param: { ref: encodeURIComponent(ref) }, json: { code: product.data } });
    return edited(c, ref, res, "POST /groups/:ref/products", { find });
  })
  .get("/groups/:ref/find", async (c) => {
    const detail = await groupDetail(c, c.req.param("ref"));
    if (!detail) return c.html(notice("No such group. It may have been deleted: reload the page."));
    const q = words.parse(c.req.query("q"));
    return c.html(groupFound(detail.group.ref, await search(c, q), new Set(detail.members.map((m) => m.code)), q));
  })
  // Delete group (Made groups only): htmx then opens the type's list.
  .post("/groups/:ref/delete", async (c) => {
    const ref = c.req.param("ref");
    const detail = await groupDetail(c, ref);
    if (!detail) return c.html(notice("No such group. It may have been deleted: reload the page."));
    const res = await c.var.deps.api.groups[":ref"].$delete({ param: { ref: encodeURIComponent(ref) } });
    if (res.status === 400) return c.html(notice("Only a Made group is deleted."));
    if (res.status !== 200 && res.status !== 404) throw unexpected(res, "DELETE /groups/:ref");
    return c.body(null, 200, { "HX-Redirect": groupHref({ type: detail.group.type }) });
  });
