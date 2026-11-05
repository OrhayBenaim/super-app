// The Product groups pages (A8, A9): a Product type's groups beside the open one, and a new Made group. Every edit is an
// htmx post answered with the open group (#group) or the new group's Products (#picked) again, from the private app.
import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import { PRODUCT_TYPES, type ProductType } from "@grocer/shared/product-types";
import { SEARCH } from "@grocer/shared/search";
import type { ApiClient } from "#/api-client.ts";
import { num, plural, shekels, size, TYPE_NAMES } from "#/pages/format.ts";
import { notice, type Html } from "#/pages/layout.ts";
import { imageCell } from "#/pages/products.ts";
import { badge, button, chips, field, pageHeader, section, select, table } from "#/pages/ui.ts";

export type List = InferResponseType<ApiClient["groups"]["types"][":type"]["$get"], 200>;
export type Detail = InferResponseType<ApiClient["groups"][":ref"]["$get"], 200>;
export type Found = InferResponseType<ApiClient["products"]["$get"], 200>["products"][number];
/** A Product picked for a new group: what its row and the cheapest line show. The form carries it as JSON. */
export type Picked = Pick<Found, "code" | "name" | "measure" | "size" | "storeCount" | "minPrice">;
export type Measure = "kg" | "l" | "unit";

const BY = { kg: "by the kilo", l: "by the liter", unit: "by the pack" } as const;
const PER = { kg: "kilo", l: "liter", unit: "pack" } as const;
const COMPARED = { kg: "Per kilo", l: "Per liter", unit: "Per pack" } as const;
export const PAGE_SIZE = 50;

export const groupHref = (p: { type?: string | null; q?: string; page?: number; ref?: string }) =>
  `/groups?${new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (v && !(k === "page" && v === 1) ? [[k, String(v)]] : [])))}`;
const editHref = (ref: string, action: string) => `/groups/${encodeURIComponent(ref)}/${action}`;
const typeOptions = PRODUCT_TYPES.map((t) => ({ value: t, text: TYPE_NAMES[t] }));

/** "1 l · 612 stores" */
const sizeAndStores = (p: Pick<Found, "measure" | "size" | "storeCount">) => `${size(p)} · ${plural(p.storeCount, "store")}`;

/** The list beside the open group: the filter field and type select, a type's groups, and (on /groups/new) the draft on top. */
function groupList(type: ProductType, q: string, page: number, list: List, open: { ref?: string; draft?: boolean }) {
  const items = list.groups.map(
    (g) => html`<li>
      <a href="${groupHref({ type, q, page, ref: g.ref })}"${g.ref === open.ref ? html` aria-current="true"` : ""}>
        <span><strong lang="he">${g.name}</strong><span class="footnote muted">${plural(g.productCount, "Product")} · ${BY[g.measure]}</span></span>
        ${g.made ? badge("finished", "Made group") : g.edited ? badge("finished", "Edited") : ""}
      </a>
    </li>`,
  );
  const draft = open.draft
    ? html`<li><a href="/groups/new" aria-current="true"><span><strong>New group</strong><span class="footnote muted">Not saved yet</span></span></a></li>`
    : "";
  const first = (page - 1) * PAGE_SIZE + 1;
  return html`<div class="group-column">
    <form class="group-filter" method="get" action="/groups" role="search">
      <input type="search" name="q" value="${q}" placeholder="Filter groups" aria-label="Filter groups" maxlength="${SEARCH.maxLength}" />
      <span class="select">
        <select name="type" aria-label="Product type" onchange="this.form.submit()">
          ${typeOptions.map((o) => html`<option value="${o.value}"${o.value === type ? html` selected` : ""}>${o.text}</option>`)}
        </select>
      </span>
    </form>
    ${list.groups.length || draft
      ? html`<ul class="group group-list">
          ${draft}${items}
        </ul>`
      : notice(q ? `No Product groups in ${TYPE_NAMES[type]} hold “${q}”.` : `No Product groups in ${TYPE_NAMES[type]} yet.`)}
    <nav class="pages footnote muted" aria-label="Pages">
      ${list.groups.length ? html`<span>${num(first)}–${num(first + list.groups.length - 1)} of ${plural(list.total, "group")}</span>` : ""}
      ${page > 1 ? html`<a href="${groupHref({ type, q, page: page - 1 })}">Previous</a>` : ""}
      ${list.hasMore ? html`<a href="${groupHref({ type, q, page: page + 1 })}">Next</a>` : ""}
    </nav>
  </div>`;
}

/** Both pages: the header, then the list beside the open group or the new group form. */
export const groupsPage = (p: { type: ProductType; q: string; page: number; list: List; ref?: string; draft?: boolean; body: Html | "" }) => html`${pageHeader({
    title: "Product groups",
    summary: `The groups a List item can match. ${plural(p.list.total, "group")} in ${TYPE_NAMES[p.type]} · ${num(p.list.madeOrEdited)} made or edited here`,
    action: p.draft ? undefined : html`<a class="button button-filled" href="/groups/new?type=${p.type}">New group</a>`,
  })}
  <div class="groups">${groupList(p.type, p.q, p.page, p.list, { ref: p.ref, draft: p.draft })} ${p.body}</div>`;

/** Search results to add: "Added" for a Product already in, else its Add button. */
const candidates = (found: Found[], inGroup: Set<string>, q: string, add: (p: Found) => Html) => {
  if (q.length < SEARCH.minLength) return "";
  if (!found.length) return html`<p class="footnote muted">No Products match “${q}”.</p>`;
  return html`<ul class="candidates">
    ${found.map(
      (p) => html`<li>
        <span><span lang="he">${p.name}</span><span class="footnote muted">${sizeAndStores(p)}</span></span>
        ${inGroup.has(p.code) ? html`<span class="muted">Added</span>` : add(p)}
      </li>`,
    )}
  </ul>`;
};

/** The open group's Add Products results (#found): Add posts the code with the search, so the answer keeps both. */
export const groupFound = (ref: string, found: Found[], members: Set<string>, q: string) =>
  candidates(found, members, q, (p) =>
    button("Add", {
      variant: "plain",
      attrs: { name: "code", value: p.code, "aria-label": `Add ${p.name}`, "hx-post": editHref(ref, "add"), "hx-include": "closest .add-products", "hx-target": "#group", "hx-swap": "outerHTML" },
    }),
  );

const NOTE = {
  word: "Grocer starts each group from the words in Product names. Products you add or remove here stay that way after every Price sync.",
  made: "A Made group holds exactly the Products added here. Price syncs never change it.",
};

/**
 * The open group (#group): its facts and Rename, narrower groups, the note on how groups are made, its members cheapest
 * per measure first with Remove, Add Products, and Delete group for a Made group. `error` is the last edit's refusal;
 * `find` keeps Add Products open with its search after an add.
 */
export function openGroup({ group: g, narrower, members }: Detail, p: { error?: string; renameError?: string; find?: { q: string; found: Found[] } } = {}) {
  const facts = [g.type ? TYPE_NAMES[g.type] : "No Product type", BY[g.measure], `commonest pack ${size(g)}`, plural(g.productCount, "Product"), plural(g.storeCount, "store")];
  const rows = members.map(
    (m) => html`<tr>
      ${imageCell(m.code)}
      <td lang="he"><a href="/products/${encodeURIComponent(m.code)}">${m.name}</a></td>
      <td>${size(m)}</td>
      <td class="num">${shekels(m.minPrice)}</td>
      <td class="num">${num(m.storeCount)}</td>
      <td class="num">
        ${button("Remove", {
          variant: "destructive",
          attrs: { name: "code", value: m.code, "aria-label": `Remove ${m.name}`, "hx-post": editHref(g.ref, "remove"), "hx-target": "#group", "hx-swap": "outerHTML" },
        })}
      </td>
    </tr>`,
  );
  return html`<div id="group" class="open-group">
    <div class="group group-body">
      <div class="group-head">
        <h2 lang="he">${g.name}</h2>
        <span class="muted">${facts.join(" · ")}</span>
        <details class="rename"${p.renameError ? html` open` : ""}>
          <summary class="button button-plain">Rename</summary>
          <form hx-post="${editHref(g.ref, "name")}" hx-target="#group" hx-swap="outerHTML">
            ${field({ label: "Name", name: "name", value: g.name, error: p.renameError, attrs: { lang: "he", maxlength: "100" } })}
            ${button("Save name", { type: "submit" })}
          </form>
        </details>
      </div>
      ${narrower.length
        ? html`<div class="narrower">
            <span class="footnote">Narrower</span>
            ${chips("Narrower groups", narrower.map((n) => ({ text: n.name, count: n.productCount, href: groupHref({ type: g.type, ref: n.ref }) })))}
          </div>`
        : ""}
      <p class="footnote muted">${g.made ? NOTE.made : NOTE.word}</p>
      ${p.error ? html`<p class="message failed" role="alert">${p.error}</p>` : ""}
    </div>
    ${section(
      `Products in this group, cheapest per ${PER[g.measure]} first`,
      members.length
        ? table(["", "Product", "Size", { label: "Cheapest", num: true }, { label: "Stores", num: true }, ""], rows)
        : html`<p class="group-body muted">No store prices a Product in this group.</p>`,
      num(g.productCount),
    )}
    <div class="group-actions">
      <details class="add-products"${p.find ? html` open` : ""}>
        <summary class="button button-tinted">Add Products</summary>
        <div class="group group-body">
          <input
            type="search"
            name="q"
            value="${p.find?.q ?? ""}"
            aria-label="Find Products to add"
            placeholder="Name or barcode"
            maxlength="${SEARCH.maxLength}"
            hx-get="${editHref(g.ref, "find")}"
            hx-trigger="input changed delay:300ms, search"
            hx-target="#found"
          />
          <div id="found">${p.find ? groupFound(g.ref, p.find.found, new Set(members.map((m) => m.code)), p.find.q) : ""}</div>
        </div>
      </details>
      ${g.made
        ? button("Delete group", {
            variant: "destructive",
            attrs: { "hx-post": editHref(g.ref, "delete"), "hx-confirm": "Delete this Made group? List items matched to it are left unmatched." },
          })
        : ""}
    </div>
  </div>`;
}

/** "Cheapest per liter: ₪8.90 at 540 stores", over the new group's priced, sized Products. */
function cheapest(items: Picked[], measure: Measure) {
  const per = (p: Picked) => (measure === "unit" || !p.size ? p.minPrice : p.minPrice / p.size);
  const best = items.filter((p) => p.measure && p.minPrice > 0).toSorted((a, b) => per(a) - per(b))[0];
  return best ? html`<p class="footnote muted">Cheapest per ${PER[measure]}: ${shekels(per(best))} at ${plural(best.storeCount, "store")}</p>` : "";
}

const draftPost = { "hx-post": "/groups/new/draft", "hx-target": "#picked", "hx-swap": "outerHTML" };
const pickedOf = (p: Found): Picked => ({ code: p.code, name: p.name, measure: p.measure, size: p.size, storeCount: p.storeCount, minPrice: p.minPrice });

/** The new group's Products (#picked), each carried in the form as JSON, with Remove. */
export const pickedList = (items: Picked[], measure: Measure) => html`<div id="picked">
  <h3>In this group · ${items.length}</h3>
  ${items.length
    ? html`<ul class="candidates">
        ${items.map(
          (p) => html`<li>
            <input type="hidden" name="item" value="${JSON.stringify(p)}" />
            <span lang="he">${p.name || p.code}</span>
            ${button("Remove", { variant: "destructive", attrs: { name: "remove", value: p.code, "aria-label": `Remove ${p.name || p.code}`, ...draftPost } })}
          </li>`,
        )}
      </ul>`
    : html`<p class="footnote muted">Add Products from the search.</p>`}
  ${cheapest(items, measure)}
</div>`;

/** The new group's search results (#results); `oob` when a draft answer sends them beside #picked. */
export const draftResults = (found: Found[], items: Picked[], q: string, oob = false) => html`<div id="results"${oob ? html` hx-swap-oob="true"` : ""}>
  ${candidates(found, new Set(items.map((p) => p.code)), q, (p) =>
    button("Add", { variant: "plain", attrs: { name: "add", value: JSON.stringify(pickedOf(p)), "aria-label": `Add ${p.name}`, ...draftPost } }),
  )}
</div>`;

export type Draft = { name: string; productType: ProductType; measure: Measure; size: string; items: Picked[]; q: string; found: Found[] };
export type DraftErrors = Partial<Record<"name" | "size" | "form", string>>;

/** A9: the new group form. Create posts it as a plain form; the search, Add and Remove post it with htmx. */
export const newGroupForm = (d: Draft, errors: DraftErrors = {}) => html`<form class="group group-body new-group" method="post" action="/groups/new">
  <h2>New group</h2>
  <div class="new-group-fields">
    ${field({ label: "Name", name: "name", value: d.name, error: errors.name, attrs: { lang: "he", maxlength: "100" } })}
    ${select({ label: "Product type", name: "productType", value: d.productType, options: typeOptions })}
    ${select({ label: "Compared", name: "measure", value: d.measure, options: Object.entries(COMPARED).map(([value, text]) => ({ value, text })), attrs: { ...draftPost, "hx-trigger": "change" } })}
    ${field({ label: "Pack count", name: "size", value: d.size, type: "number", error: errors.size, attrs: { min: "1", max: "1000", placeholder: "Per pack only" } })}
  </div>
  <div class="new-group-products">
    <div>
      <h3>Add Products</h3>
      <input
        type="search"
        name="q"
        value="${d.q}"
        aria-label="Find Products to add"
        placeholder="Name or barcode"
        maxlength="${SEARCH.maxLength}"
        onkeydown="if (event.key === 'Enter') event.preventDefault()"
        hx-post="/groups/new/draft"
        hx-trigger="input changed delay:300ms"
        hx-target="#picked"
        hx-swap="outerHTML"
      />
      ${draftResults(d.found, d.items, d.q)}
    </div>
    ${pickedList(d.items, d.measure)}
  </div>
  ${errors.form ? html`<p class="message failed" role="alert">${errors.form}</p>` : ""}
  <div class="group-actions">
    <span>${button("Create group", { type: "submit" })} <a class="button button-plain" href="${groupHref({ type: d.productType })}">Cancel</a></span>
    <span class="footnote muted">The group shows on Home and in Compare from now on.</span>
  </div>
</form>`;
