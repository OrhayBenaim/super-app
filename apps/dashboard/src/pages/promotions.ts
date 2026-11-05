import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { shekels } from "#/pages/format.ts";
import { when } from "#/pages/syncs.ts";

type List = InferResponseType<ApiClient["promotions"]["$get"], 200>;
type Promotion = List["promotions"][number];
type Detail = InferResponseType<ApiClient["promotions"][":id"]["$get"], 200>;

const STATES = { running: "Running", notToday: "Not today", future: "Future", ended: "Ended" } as const;
const KINDS = { price: "Price", bundle: "Bundle", percent: "Percent off", nth: "Nth unit off", off: "Amount off", info: "Information only" } as const;
const AUDIENCES = { all: "Everyone", club: "Club", card: "Card", coupon: "Coupon" } as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const badge = (s: Promotion["state"]) => html`<span class="badge badge-promo-${s}">${STATES[s]}</span>`;
const amount = (p: Promotion) => (p.kind === "info" ? "—" : p.kind === "percent" || p.kind === "nth" ? `${p.amount}%` : shekels(p.amount));
const days = (d: string | null) => (d === null ? "Every day" : d.split(",").map((n) => DAYS[Number(n) - 1] ?? n).join(", "));
const limits = (p: Promotion) => [p.limitQty === null ? "" : `Up to ${p.limitQty}`, p.minPurchase ? `Spend ${shekels(p.minPurchase)}` : ""].filter(Boolean).join(" · ") || "—";
const storePromotionsHref = (id: string) => `/stores/${encodeURIComponent(id)}/promotions`;

/** A store's Promotions, running ones first, with their terms as the promotion file gave them. */
export const storePromotionsPage = ({ store, promotions }: List) => html`<header>
    <h1 lang="he">${store.name}</h1>
    <a href="/stores/${encodeURIComponent(store.id)}">${store.chainName} store</a>
  </header>
  <h2>Promotions</h2>
  ${promotions.length === 0
    ? html`<p class="notice">This store publishes no Promotions.</p>`
    : html`<div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">Promotion</th>
              <th scope="col">Kind</th>
              <th scope="col">Amount</th>
              <th scope="col">Min qty</th>
              <th scope="col">Audience</th>
              <th scope="col">Starts</th>
              <th scope="col">Ends</th>
              <th scope="col">Days</th>
              <th scope="col">Limits</th>
              <th scope="col">Products</th>
            </tr>
          </thead>
          <tbody>
            ${promotions.map(
              (p) => html`<tr>
                <td>${badge(p.state)}</td>
                <td lang="he"><a href="/promotions/${p.id}">${p.description}</a></td>
                <td>${KINDS[p.kind]}</td>
                <td>${amount(p)}</td>
                <td>${p.minQty}</td>
                <td>${AUDIENCES[p.audience]}</td>
                <td>${when(p.startsAt)}</td>
                <td>${when(p.endsAt)}</td>
                <td>${days(p.days)}</td>
                <td>${limits(p)}</td>
                <td>${p.itemCount}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>`}`;

/** One Promotion: its terms and the Products it covers, with their Shelf price at its store. */
export const promotionPage = ({ promotion: p, store, products }: Detail) => html`<header>
    <h1 lang="he">${p.description}</h1>
    <a href="${storePromotionsHref(store.id)}" lang="he">${store.name} Promotions</a>
  </header>
  <dl class="details">
    <dt>State</dt>
    <dd>${badge(p.state)}</dd>
    <dt>Chain's id</dt>
    <dd>${p.promotionId}</dd>
    <dt>Kind</dt>
    <dd>${KINDS[p.kind]}</dd>
    <dt>Amount</dt>
    <dd>${amount(p)}</dd>
    <dt>Min qty</dt>
    <dd>${p.minQty}</dd>
    <dt>Audience</dt>
    <dd>${AUDIENCES[p.audience]}</dd>
    <dt>Dates</dt>
    <dd>${when(p.startsAt)} to ${when(p.endsAt)}</dd>
    <dt>Days</dt>
    <dd>${days(p.days)}</dd>
    <dt>Limits</dt>
    <dd>${limits(p)}</dd>
  </dl>
  <h2>Products</h2>
  ${products.length === 0
    ? html`<p class="notice">It covers no Products.</p>`
    : html`<div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Code</th>
              <th scope="col">Shelf price here</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(
              (r) => html`<tr>
                <td lang="he">${r.name === null ? html`<span class="muted">Not in Products</span>` : html`<a href="/products/${encodeURIComponent(r.code)}">${r.name}</a>`}</td>
                <td class="muted">${r.code}</td>
                <td>${r.price === null ? html`<span class="muted">Not priced</span>` : shekels(r.price)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>`}`;
