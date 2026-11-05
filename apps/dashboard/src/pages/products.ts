import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { ApiClient } from "#/api-client.ts";
import { when } from "#/pages/syncs.ts";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;
type Found = InferResponseType<ApiClient["products"]["$get"], 200>;
type Detail = InferResponseType<ApiClient["products"][":code"]["$get"], 200>;

const shekels = (n: number) => `₪${n.toFixed(2)}`;
const size = (p: { measure: string | null; size: number | null }) => (p.measure ? `${p.size} ${p.measure === "unit" ? "pcs" : p.measure}` : "—");
const SOLD_BY = { weight: "By weight", unit: "By the unit" } as const;
const type = (t: string | null) => t ?? html`<span class="muted">None yet</span>`;
const href = (code: string) => `/products/${encodeURIComponent(code)}`;
const pageHref = (q: string, page: number) => `/products?${new URLSearchParams({ q, page: String(page) })}`;

export const searchForm = (q: string) => html`<form method="get" action="/products" class="search">
  <label for="q">Name or barcode</label>
  <input id="q" name="q" type="search" value="${q}" maxlength="100" autofocus />
  <button type="submit">Search</button>
</form>`;

/** The Products page: the search form, then what the search found (or nothing before a search). */
export const productsPage = (q: string, found: Html | "" = "") => html`<header>
    <h1>Products</h1>
  </header>
  ${searchForm(q)} ${found}`;

export const notice = (text: string) => html`<p class="notice">${text}</p>`;

/** One page of Products the search found, with links to the pages around it. */
export const productsFound = (q: string, page: number, { products, hasMore }: Found) =>
  products.length === 0
    ? notice(`No Products match “${q}”.`)
    : html`<div class="scroll">
          <table>
            <thead>
              <tr>
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
                  <td lang="he"><a href="${href(p.code)}">${p.name}</a></td>
                  <td class="muted">${p.code}</td>
                  <td lang="he">${p.manufacturer ?? "—"}</td>
                  <td>${size(p)}</td>
                  <td>${SOLD_BY[p.soldBy]}</td>
                  <td>${type(p.productType)}</td>
                  <td>${shekels(p.minPrice)}</td>
                  <td>${p.storeCount}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>
        <nav class="pages" aria-label="Pages">
          ${page > 1 ? html`<a href="${pageHref(q, page - 1)}">Previous</a>` : ""}
          <span class="muted">Page ${page}</span>
          ${hasMore ? html`<a href="${pageHref(q, page + 1)}">Next</a>` : ""}
        </nav>`;

/** One Product: its Product image, details, its price at every store (cheapest first) and the Promotions running there. */
export const productPage = ({ product: p, prices }: Detail, image: string | null) => html`<header>
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
      <dd>${type(p.productType)}</dd>
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
      </div>`}`;
