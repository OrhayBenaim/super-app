import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import { SEARCH } from "@grocer/shared/search";
import { PRODUCT_TYPE_FILTERS, PRODUCT_TYPES, type ProductTypeFilter } from "@grocer/shared/product-types";
import type { ApiClient } from "#/api-client.ts";
import { day, num, plural, shekels, shortDate, size, SOLD_BY, TYPE_NAMES } from "#/pages/format.ts";
import { notice, type Html } from "#/pages/layout.ts";
import { badge, button, pageHeader, section, table } from "#/pages/ui.ts";

type Found = InferResponseType<ApiClient["products"]["$get"], 200>;
type Counts = InferResponseType<ApiClient["products"]["types"]["$get"], 200>;
/** Product cards on a page. */
export const PAGE_SIZE = 48;
type Detail = InferResponseType<ApiClient["products"][":code"]["$get"], 200>;
/** The Products page's type filter: a Product type, "none" for none yet, or undefined for any. */
export type TypeFilter = ProductTypeFilter | undefined;

const href = (code: string) => `/products/${encodeURIComponent(code)}`;
const pageHref = (q: string, type: TypeFilter, page: number) => `/products?${new URLSearchParams({ ...(type && { type }), ...(q && { q }), page: String(page) })}`;

/** A Product image cell that loads its image when it scrolls into view: one lookup per row seen, none up front. */
export const imageCell = (code: string) =>
  html`<td hx-get="${href(code)}/image" hx-trigger="intersect once" hx-swap="innerHTML"><span class="muted">—</span></td>`;
/** What the image cell swaps in. The row names the Product, so the image adds no text. */
export const thumbnail = (image: string | null) => (image ? html`<img src="${image}" alt="" width="48" height="48" />` : html`<span class="muted">—</span>`);

/** The Products page's left column: All Products first, each Product type with its count, No type yet last in amber. */
const typeList = ({ total, types }: Counts, chosen: TypeFilter) => html`<nav class="types group" aria-label="Product types">
  ${[undefined, ...PRODUCT_TYPE_FILTERS].map((t) => {
    const n = t === undefined ? total : types[t];
    return html`<a href="${t ? `/products?type=${t}` : "/products"}"${t === chosen ? html` aria-current="page"` : ""}>${t ? TYPE_NAMES[t] : "All Products"} <span class="count${t === "none" && n ? " warn" : ""}">${num(n)}</span></a>`;
  })}
</nav>`;

const card = (p: Found["products"][number]) => html`<li>
  <a class="card" href="${href(p.code)}">
    <span class="slot" hx-get="${href(p.code)}/image" hx-trigger="intersect once" hx-swap="innerHTML"></span>
    <span class="card-text">
      <span class="name" lang="he">${p.name}</span>
      <span class="footnote muted">${size(p)}</span>
      <span><strong>from ${shekels(p.minPrice)}</strong> <span class="footnote muted">${plural(p.storeCount, "store")}</span></span>
    </span>
  </a>
</li>`;

/** One page of the chosen type's Products (or what the filter found in it) as cards, with the range and the pages around it. */
export const productCards = (q: string, type: TypeFilter, page: number, { products, hasMore }: Found, total: number) => {
  if (products.length === 0) return notice(q ? `No Products match “${q}”.` : "No priced Products have this Product type.");
  const first = (page - 1) * PAGE_SIZE + 1;
  return html`<ul class="cards">
      ${products.map(card)}
    </ul>
    <nav class="pages" aria-label="Pages">
      <span class="footnote muted">${num(first)}–${num(first + products.length - 1)}${q ? "" : ` of ${num(total)}`}</span>
      <span>
        ${page > 1 ? html`<a href="${pageHref(q, type, page - 1)}" rel="prev">Previous</a>` : ""}
        ${hasMore ? html`<a href="${pageHref(q, type, page + 1)}" rel="next">Next</a>` : ""}
      </span>
    </nav>`;
};

/** The Products page (A6): the types list beside the chosen type's Products, which the filter field narrows by name or barcode. */
export const productsPage = (counts: Counts, q: string, type: TypeFilter, found: Html) => {
  const name = type ? TYPE_NAMES[type] : "All Products";
  const n = type ? counts.types[type] : counts.total;
  return html`${pageHeader({ title: "Products", summary: `${plural(counts.total, "Product")} · ${num(counts.types.none)} ${counts.types.none === 1 ? "has" : "have"} no type yet` })}
    <div class="browse">
      ${typeList(counts, type)}
      <div>
        <div class="browse-head">
          <div>
            <h2>${name}</h2>
            <p class="footnote muted">${plural(n, "Product")} · most widely sold first</p>
          </div>
          <form method="get" action="/products" class="filter" role="search">
            ${type ? html`<input type="hidden" name="type" value="${type}" />` : ""}
            <input type="search" name="q" value="${q}" maxlength="${SEARCH.maxLength}" aria-label="Filter ${name}" placeholder="Filter ${name}" />
          </form>
        </div>
        ${found}
      </div>
    </div>`;
};

/** A Product's type as a form that changes it (htmx swaps the answer in); "No type yet" is not one to choose. */
export const typeForm = (code: string, productType: string | null, saved = false) => html`<form id="product-type" class="type-form" hx-post="${href(code)}/type" hx-swap="outerHTML">
  <span class="select">
    <select name="productType" aria-label="Product type">
      ${productType ? "" : html`<option value="" selected disabled>No type yet</option>`}
      ${PRODUCT_TYPES.map((t) => html`<option value="${t}"${t === productType ? html` selected` : ""}>${TYPE_NAMES[t]}</option>`)}
    </select>
  </span>
  ${button("Save type", { type: "submit" })} ${saved ? html`<span role="status" class="footnote">Saved.</span>` : ""}
  <p class="footnote muted">
    ${productType ? "A type you save here is never changed by a Price sync." : "No type yet: the Product type step of the next Price sync chooses one."}
  </p>
</form>`;

const MEASURES: Record<string, string> = { kg: "by the kilo", l: "by the liter" };
const AUDIENCES = { all: "Everyone", club: "Club", card: "Card", coupon: "Coupon" } as const;
const ON_TERMS = { all: "", club: "for club members", card: "with the card", coupon: "with a coupon" } as const;
const STATE_BADGES = { running: ["ok", "Running"], notToday: ["finished", "Not today"], future: ["finished", "Starts"], ended: ["skipped", "Ended"] } as const;

const promotionBadge = (p: Detail["promotions"][number]) => {
  const [kind, text] = STATE_BADGES[p.state];
  return badge(kind, p.state === "future" ? `${text} ${shortDate(p.startsAt)}` : text);
};

/** The Product group it is in: its name (linking to it), how many Products it holds and how it is priced. */
const groupFact = (g: Detail["group"]) =>
  g
    ? html`<a href="/groups?ref=${encodeURIComponent(g.ref)}" lang="he">${g.name}</a>
        <span class="footnote muted">${plural(g.products, "Product")} · ${MEASURES[g.measure] ?? (g.size === 1 ? "by the unit" : `packs of ${g.size}`)}</span>`
    : html`<span class="muted">In no Product group</span>`;

const soldAt = (prices: Detail["prices"]) =>
  prices.length === 0
    ? html`<span class="muted">No store prices it</span>`
    : `${plural(prices.length, "store")} in ${plural(new Set(prices.map((r) => r.chainId)).size, "Chain")} · from ${shekels(prices[0]!.price)}`;

const pricesTable = (prices: Detail["prices"], now: Date) =>
  prices.length === 0
    ? notice("No store prices it.")
    : table(
        ["Price", "Chain", "Store", "City", "Updated", "Promotion running there"],
        prices.map(
          (r) => html`<tr>
            <td><strong>${shekels(r.price)}</strong></td>
            <td>${r.chainName}</td>
            <td><a href="/stores/${encodeURIComponent(r.storeId)}" lang="he">${r.storeName}</a></td>
            <td lang="he">${r.city}</td>
            <td class="muted">${day(r.updatedAt, now)}</td>
            <td>
              ${r.promotions.map((p) =>
                p.kind === "info"
                  ? html`<div><span class="muted" lang="he">${p.description}</span> information only</div>`
                  : html`<div><span class="deal" lang="he">${p.text}</span> ${ON_TERMS[p.audience]}</div>`,
              )}
            </td>
          </tr>`,
        ),
      );

type Promotion = Detail["promotions"][number];
/** Its Promotions, one row per Chain and promotion id across the stores that price it, in the order they come (running first). */
function promotionRows(promotions: Promotion[]) {
  const rows = new Map<string, { first: Promotion; stores: number }>();
  for (const p of promotions) {
    const row = rows.get(`${p.chainName}|${p.promotionId}`);
    if (row) row.stores++;
    else rows.set(`${p.chainName}|${p.promotionId}`, { first: p, stores: 1 });
  }
  return [...rows.values()];
}

const promotionsTable = (rows: ReturnType<typeof promotionRows>) =>
  rows.length === 0
    ? notice("No store that prices it has a Promotion on it.")
    : table(
        ["Promotion", "Where", "Who", "Dates", "State"],
        rows.map(
          ({ first: p, stores }) => html`<tr>
            <td><a href="/promotions/${p.id}" lang="he">${p.description}</a></td>
            <td>${p.chainName} · ${plural(stores, "store")}</td>
            <td>${AUDIENCES[p.audience]}</td>
            <td>${shortDate(p.startsAt)} – ${shortDate(p.endsAt)}</td>
            <td>${promotionBadge(p)}</td>
          </tr>`,
        ),
      );

/** "barcode 7290000066318", or "Chain code 111" for a code only one Chain uses (its Chain id, a colon, its own code). */
const codeText = (code: string) => (code.includes(":") ? `Chain code ${code.slice(code.indexOf(":") + 1)}` : `barcode ${code}`);

/**
 * One Product (A7): its image tile (a button; the image ticket adds its upload dialog), the facts (its type form, the Product group
 * it is in, where it is sold), its price at every store cheapest first with the Promotion running there, and its Promotions.
 */
export const productPage = ({ product: p, group, prices, promotions }: Detail, image: string | null, now: Date) => {
  const type = (p.productType ?? "none") as ProductTypeFilter;
  const rows = promotionRows(promotions);
  return html`${pageHeader({
      breadcrumb: { href: `/products?type=${type}`, text: `Products · ${TYPE_NAMES[type]}` },
      title: html`<span lang="he">${p.name}</span>`,
      summary: html`${p.manufacturer ? html`<span lang="he">${p.manufacturer}</span> · ` : ""}${size(p)} · sold ${SOLD_BY[p.soldBy].toLowerCase()} · ${codeText(p.code)}`,
    })}
    <div class="product">
      <div class="group image-group">
        <button type="button" class="image-tile" id="product-image" aria-label="Change the Product image">
          ${image ? html`<img src="${image}" alt="${p.name}" width="160" height="160" />` : html`<span class="slot">No Product image</span>`}
        </button>
      </div>
      <dl class="group facts">
        <div><dt>Product type</dt><dd>${typeForm(p.code, p.productType)}</dd></div>
        <div><dt>Product group</dt><dd>${groupFact(group)}</dd></div>
        <div><dt>Sold at</dt><dd>${soldAt(prices)}</dd></div>
      </dl>
    </div>
    ${section("Prices, cheapest first", pricesTable(prices, now), plural(prices.length, "store"))}
    ${section("Promotions on this Product", promotionsTable(rows), rows.length)}`;
};
