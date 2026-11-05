import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import { SEARCH } from "@grocer/shared/search";
import { PRODUCT_TYPES, type ProductTypeFilter } from "@grocer/shared/product-types";
import type { ApiClient } from "#/api-client.ts";
import { shekels, size, SOLD_BY, when } from "#/pages/format.ts";
import { notice, type Html } from "#/pages/layout.ts";
import { badge } from "#/pages/promotions.ts";

type Found = InferResponseType<ApiClient["products"]["$get"], 200>;
type Detail = InferResponseType<ApiClient["products"][":code"]["$get"], 200>;
/** The Products page's type filter: a Product type, "none" for none yet, or undefined for any. */
export type TypeFilter = ProductTypeFilter | undefined;

const typeText = (t: string | null) => t ?? html`<span class="muted">None yet</span>`;
const href = (code: string) => `/products/${encodeURIComponent(code)}`;
const pageHref = (q: string, type: TypeFilter, page: number) => `/products?${new URLSearchParams({ q, type: type ?? "", page: String(page) })}`;
const option = (value: string, label: string, chosen: string | null | undefined) =>
  html`<option value="${value}"${value === chosen ? html` selected` : ""}>${label}</option>`;

/** A Product image cell that loads its image when it scrolls into view: one lookup per row seen, none up front. */
export const imageCell = (code: string) =>
  html`<td hx-get="${href(code)}/image" hx-trigger="intersect once" hx-swap="innerHTML"><span class="muted">—</span></td>`;
/** What the image cell swaps in. The row names the Product, so the image adds no text. */
export const thumbnail = (image: string | null) => (image ? html`<img src="${image}" alt="" width="48" height="48" />` : html`<span class="muted">—</span>`);

export const searchForm = (q: string, type: TypeFilter) => html`<form method="get" action="/products" class="search">
  <label for="q">Name or barcode</label>
  <input id="q" name="q" type="search" value="${q}" maxlength="${SEARCH.maxLength}" autofocus />
  <label for="type">Product type</label>
  <select id="type" name="type">
    ${option("", "Any", type ?? "")} ${PRODUCT_TYPES.map((t) => option(t, t, type))} ${option("none", "None yet", type)}
  </select>
  <button type="submit">Search</button>
</form>`;

/** The Products page: the search form, then what the search or the type filter found (or nothing before either). */
export const productsPage = (q: string, type: TypeFilter, found: Html | "" = "") => html`<header>
    <h1>Products</h1>
  </header>
  ${searchForm(q, type)} ${found}`;

/** A Product's type as a form that changes it (htmx swaps the answer in); "None yet" is not one to choose. */
export const typeForm = (code: string, productType: string | null, saved = false) => html`<form
  id="product-type"
  class="search"
  hx-post="/products/${encodeURIComponent(code)}/type"
  hx-swap="outerHTML"
>
  <select name="productType" aria-label="Product type">
    ${productType ? "" : html`<option value="" selected disabled>None yet</option>`} ${PRODUCT_TYPES.map((t) => option(t, t, productType))}
  </select>
  <button type="submit">Save</button>
  ${saved ? html`<span role="status">Saved.</span>` : ""}
</form>`;

/** One page of Products the search or the type filter found, with links to the pages around it. */
export const productsFound = (q: string, type: TypeFilter, page: number, { products, hasMore }: Found) =>
  products.length === 0
    ? notice(q ? `No Products match “${q}”.` : "No priced Products have this Product type.")
    : html`<div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">Product</th>
                <th scope="col">Code</th>
                <th scope="col">Manufacturer</th>
                <th scope="col">Size</th>
                <th scope="col">Sold by</th>
                <th scope="col">Product type</th>
                <th scope="col">Cheapest</th>
                <th scope="col">Stores</th>
              </tr>
            </thead>
            <tbody>
              ${products.map(
                (p) => html`<tr>
                  ${imageCell(p.code)}
                  <td lang="he"><a href="${href(p.code)}">${p.name}</a></td>
                  <td class="muted">${p.code}</td>
                  <td lang="he">${p.manufacturer ?? "—"}</td>
                  <td>${size(p)}</td>
                  <td>${SOLD_BY[p.soldBy]}</td>
                  <td>${typeText(p.productType)}</td>
                  <td>${shekels(p.minPrice)}</td>
                  <td>${p.storeCount}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>
        <nav class="pages" aria-label="Pages">
          ${page > 1 ? html`<a href="${pageHref(q, type, page - 1)}">Previous</a>` : ""}
          <span class="muted">Page ${page}</span>
          ${hasMore ? html`<a href="${pageHref(q, type, page + 1)}">Next</a>` : ""}
        </nav>`;

/** Every Promotion on the Product at the stores that price it, running first, each linking to its page. */
const promotionsTable = (promotions: Detail["promotions"]) =>
  promotions.length === 0
    ? notice("No store that prices it has a Promotion on it.")
    : html`<div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">Promotion</th>
              <th scope="col">Chain</th>
              <th scope="col">Store</th>
              <th scope="col">Starts</th>
              <th scope="col">Ends</th>
            </tr>
          </thead>
          <tbody>
            ${promotions.map(
              (promo) => html`<tr>
                <td>${badge(promo.state)}</td>
                <td lang="he"><a href="/promotions/${promo.id}">${promo.text}</a> <span class="muted">${promo.description}</span></td>
                <td>${promo.chainName}</td>
                <td lang="he">${promo.storeName}</td>
                <td>${when(promo.startsAt)}</td>
                <td>${when(promo.endsAt)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>`;

/** One Product: its Product image, details, its price at every store (cheapest first) with the Promotions running there, and all its Promotions. */
export const productPage = ({ product: p, prices, promotions }: Detail, image: string | null) => html`<header>
    <h1 lang="he">${p.name}</h1>
    <a href="/products">Search Products</a>
  </header>
  <section class="product">
    ${image ? html`<img src="${image}" alt="${p.name}" width="160" height="160" />` : html`<p class="noimage muted">No Product image</p>`}
    <dl>
      <dt>Code</dt>
      <dd>${p.code}</dd>
      <dt>Manufacturer</dt>
      <dd lang="he">${p.manufacturer ?? "—"}</dd>
      <dt>Size</dt>
      <dd>${size(p)}${p.unitQty ? html` <span class="muted">(${p.unitQty})</span>` : ""}</dd>
      <dt>Sold by</dt>
      <dd>${SOLD_BY[p.soldBy]}</dd>
      <dt>Product type</dt>
      <dd>${typeForm(p.code, p.productType)}</dd>
    </dl>
  </section>
  <h2>Prices</h2>
  ${prices.length === 0
    ? html`<p class="notice">No store prices it.</p>`
    : html`<div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Price</th>
              <th scope="col">Chain</th>
              <th scope="col">Store</th>
              <th scope="col">City</th>
              <th scope="col">Updated</th>
              <th scope="col">Running Promotions</th>
            </tr>
          </thead>
          <tbody>
            ${prices.map(
              (r) => html`<tr>
                <td>${shekels(r.price)}</td>
                <td>${r.chainName} <span class="muted" lang="he">${r.chainNameHe}</span></td>
                <td lang="he">${r.storeName}</td>
                <td lang="he">${r.city}</td>
                <td>${when(r.updatedAt)}</td>
                <td>
                  ${r.promotions.map(
                    (promo) => html`<div>
                      <strong lang="he">${promo.text}</strong> <span class="muted">${promo.kind}, ${promo.audience}${promo.kind === "info" ? ", information only" : ""}</span>
                      <div class="muted" lang="he">${promo.description}</div>
                    </div>`,
                  )}
                </td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>`}
  <h2>Promotions</h2>
  ${promotionsTable(promotions)}`;
