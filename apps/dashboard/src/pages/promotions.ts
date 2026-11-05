import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { num, plural, shekels } from "#/pages/format.ts";
import { imageCell } from "#/pages/products.ts";
import { badge as stateBadge, chips, pageHeader, section, table, type BadgeKind } from "#/pages/ui.ts";

type List = InferResponseType<ApiClient["promotions"]["$get"], 200>;
type Detail = InferResponseType<ApiClient["promotions"][":id"]["$get"], 200>;
type Chain = InferResponseType<ApiClient["chains"]["$get"], 200>["chains"][number];
type Terms = Pick<List["promotions"][number], "kind" | "minQty" | "amount" | "audience" | "startsAt" | "endsAt" | "days" | "limitQty" | "minPurchase">;
export type Filter = { chain?: string; store?: string; kind?: string; state?: string; page?: string };

// A Promotion's state, badged as on the Product page: on its page as Compare decides it (not today: within its dates,
// not on today's weekday); the list's chips go by dates alone.
const STATES = {
  running: ["ok", "Running"],
  notToday: ["finished", "Not today"],
  future: ["finished", "Starts later"],
  ended: ["skipped", "Ended"],
} as const satisfies Record<Detail["promotion"]["state"], [BadgeKind, string]>;
const CHIPS = ["running", "future", "ended"] as const;
const KINDS = { price: "Price", bundle: "Bundle", percent: "Percent off", nth: "Nth unit off", off: "Amount off", info: "Information only" } as const;
const AUDIENCES = { all: "Everyone", club: "Club", card: "Card", coupon: "Coupon" } as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOWN_STORES = 8;

const badge = (s: Detail["promotion"]["state"]) => stateBadge(STATES[s][0], STATES[s][1]);

/** What it gives, as the Chain published it: "2 for ₪16.90", "₪1.00", "10% off", "2+1", "₪5.00 off 2"; info gives no price. */
function deal(p: Pick<Terms, "kind" | "minQty" | "amount">) {
  switch (p.kind) {
    case "price":
      return shekels(p.amount);
    case "bundle":
      return `${p.minQty} for ${shekels(p.amount)}`;
    case "percent":
      return `${p.amount}% off`;
    case "nth":
      return p.amount === 100 ? `${p.minQty - 1}+1` : `${p.amount}% off 1 in ${p.minQty}`;
    case "off":
      return `${shekels(p.amount)} off${p.minQty > 1 ? ` ${p.minQty}` : ""}`;
    case "info":
      return null;
  }
}
const dealCell = (p: Terms) => {
  const d = deal(p);
  return d === null ? html`<span class="muted">Information only</span>` : html`<strong>${d}</strong>`;
};

const ZONE = "Asia/Jerusalem";
const year = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric" });
const withYear = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric", year: "numeric" });
const withoutYear = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric" });
/** "Oct 4 – Nov 9", with a date's year when it is not this year's (`always`: on the end date too). */
function dates(p: Pick<Terms, "startsAt" | "endsAt">, now: Date, always = false) {
  const thisYear = year.format(now);
  const date = (iso: string, force: boolean) => (force || year.format(new Date(iso)) !== thisYear ? withYear : withoutYear).format(new Date(iso));
  return `${date(p.startsAt, always && year.format(new Date(p.startsAt)) !== year.format(new Date(p.endsAt)))} – ${date(p.endsAt, always)}`;
}
const days = (d: string | null) => (d === null ? "every day" : d.split(",").map((n) => DAYS[Number(n) - 1] ?? n).join(", "));
const limits = (p: Terms) => [p.limitQty === null ? "" : `Up to ${p.limitQty}`, p.minPurchase ? `Spend ${shekels(p.minPurchase)}` : ""].filter(Boolean).join(" · ") || "None";

const listHref = (filter: Filter, change: Filter) => {
  const query = new URLSearchParams(Object.entries({ ...filter, page: undefined, ...change }).filter((e): e is [string, string] => Boolean(e[1])));
  return `/promotions${query.size ? `?${query}` : ""}`;
};

/** The filters: changing one reloads the list (htmx); a new Chain clears the store, which may not be one of its. */
const filters = (list: List, chains: Chain[], filter: Filter) => html`<form
  class="toolbar"
  method="get"
  action="/promotions"
  hx-get="/promotions"
  hx-trigger="change"
  hx-target="main"
  hx-select="main"
  hx-swap="outerHTML"
  hx-push-url="true"
>
  <input type="hidden" name="state" value="${filter.state ?? "running"}" />
  <span class="select">
    <select name="chain" aria-label="Chain" hx-on:change="this.form.store.value = ''">
      <option value="">All Chains</option>
      ${chains.map((c) => html`<option value="${c.id}"${c.id === list.chain ? html` selected` : ""}>${c.name}</option>`)}
    </select>
  </span>
  <span class="select">
    <select name="store" aria-label="Store">
      <option value="">All stores</option>
      ${list.storeOptions.map((s) => html`<option value="${s.id}"${s.id === filter.store ? html` selected` : ""}>${s.name}</option>`)}
    </select>
  </span>
  <span class="select">
    <select name="kind" aria-label="Kind">
      <option value="">Any kind</option>
      ${Object.entries(KINDS).map(([k, text]) => html`<option value="${k}"${k === filter.kind ? html` selected` : ""}>${text}</option>`)}
    </select>
  </span>
  ${chips(
    "State",
    CHIPS.map((s) => ({ text: STATES[s][1], count: list.counts[s], href: listHref(filter, { state: s }), selected: (filter.state ?? "running") === s })),
  )}
</form>`;

function pager(list: List, filter: Filter) {
  const pages = Math.ceil(list.total / list.pageSize);
  if (pages <= 1) return "";
  const href = (page: number) => listHref(filter, { page: String(page) });
  return html`<nav class="pages" aria-label="Pages">
    ${list.page > 1 ? html`<a href="${href(list.page - 1)}">Previous</a>` : ""}
    <span class="muted">Page ${num(list.page)} of ${num(pages)}</span>
    ${list.page < pages ? html`<a href="${href(list.page + 1)}">Next</a>` : ""}
  </nav>`;
}

const row = (now: Date) => (p: List["promotions"][number]) => html`<tr>
  <td><a href="/promotions/${p.id}" lang="he" dir="rtl">${p.description}</a></td>
  <td>${p.chainName}</td>
  <td>${dealCell(p)}</td>
  <td>${AUDIENCES[p.audience]}</td>
  <td>${dates(p, now)}</td>
  <td class="num">${num(p.stores)}</td>
  <td class="num">${num(p.products)}</td>
</tr>`;

/** Every Chain's Promotions (A10): one row per Promotion across the stores of its Chain that publish it, most stores first. */
export const promotionsPage = (list: List, chains: Chain[], filter: Filter, now: Date) => html`${pageHeader({
    title: "Promotions",
    summary: `${num(list.counts.running)} running in ${plural(list.stores, "store")} · ${num(list.info)} are information only`,
  })}
  ${filters(list, chains, filter)}
  ${list.promotions.length === 0
    ? html`<p class="notice">No Promotions match.</p>`
    : section(
        "One row per Promotion, across the stores that publish it · most stores first",
        table(["Promotion", "Chain", "Deal", "Who", "Dates", { label: "Stores", num: true }, { label: "Products", num: true }], list.promotions.map(row(now))),
        plural(list.total, "Promotion"),
      )}
  ${pager(list, filter)}
  <p class="footnote muted">Information only: the Chain describes it but gives no price, so Compare shows its text and leaves it out of totals.</p>`;

const terms = (p: Detail["promotion"], now: Date) => {
  const d = deal(p);
  const published = [
    `kind ${p.kind}`,
    `minQty ${p.minQty}`,
    `amount ${p.amount}`,
    p.limitQty === null ? "" : `limitQty ${p.limitQty}`,
    p.minPurchase === null ? "" : `minPurchase ${p.minPurchase}`,
    p.days === null ? "" : `days ${p.days}`,
    `combines ${p.combines ? 1 : 0}`,
  ].filter(Boolean);
  return html`<dl class="terms">
    <dt>Deal</dt>
    <dd>${d === null ? html`<span class="muted">Information only</span>` : html`<strong>${d}${p.kind === "bundle" ? ` (${shekels(p.amount / p.minQty)} each)` : ""}</strong>`}</dd>
    <dt>Who</dt>
    <dd>${AUDIENCES[p.audience]}</dd>
    <dt>Dates</dt>
    <dd>${dates(p, now, true)} · ${days(p.days)}</dd>
    <dt>Limits</dt>
    <dd>${limits(p)}</dd>
    <dt>As published</dt>
    <dd class="footnote muted">${published.join(" · ")}</dd>
  </dl>`;
};

const productRow = (r: Detail["products"][number]) => html`<tr>
  ${imageCell(r.code)}
  <td>${r.name === null ? html`<span class="muted">Not in Products</span> ${r.code}` : html`<a href="/products/${encodeURIComponent(r.code)}" lang="he" dir="rtl">${r.name}</a>`}</td>
  <td class="num">${r.price === null ? html`<span class="muted">Not priced</span>` : shekels(r.price)}</td>
  <td class="num saving">${r.promotion === null ? html`<span class="muted">—</span>` : shekels(r.promotion.price)}</td>
  <td class="num saving">${r.promotion === null || r.price === null ? html`<span class="muted">—</span>` : shekels(r.price - r.promotion.price)}</td>
</tr>`;

const storeItem = (s: Detail["stores"][number]) =>
  html`<li><a href="/stores/${encodeURIComponent(s.id)}" lang="he" dir="rtl">${s.name}</a> <span class="muted" lang="he" dir="rtl">${s.city}</span></li>`;

/** The stores publishing it: the first few, and the rest behind "Show all". */
const storeList = (stores: Detail["stores"]) => html`<ul class="store-list">
    ${stores.slice(0, SHOWN_STORES).map(storeItem)}
  </ul>
  ${stores.length > SHOWN_STORES
    ? html`<details class="store-list-more">
        <summary>Show all ${num(stores.length)} stores</summary>
        <ul class="store-list">
          ${stores.slice(SHOWN_STORES).map(storeItem)}
        </ul>
      </details>`
    : ""}`;

/**
 * One Promotion (A11) across the stores of its Chain that publish it: its terms, the Products it covers at the cheapest
 * of those stores with their price on it and the saving each, and the stores.
 */
export const promotionPage = ({ promotion: p, stores, products }: Detail, now: Date) => html`${pageHeader({
    breadcrumb: { href: "/promotions", text: "Promotions" },
    title: html`<span lang="he" dir="rtl">${p.description}</span>`,
    summary: `${p.chainName} · Promotion ${p.promotionId} · ${plural(p.stores, "store")} · ${plural(p.products, "Product")}`,
    action: badge(p.state),
  })}
  <div class="promotion-layout">
    <div>
      ${section("Terms", terms(p, now))}
      ${products.length === 0
        ? html`<p class="notice">It covers no Products.</p>`
        : section(
            `Products it covers · Shelf price at the cheapest of the ${plural(p.stores, "store")}`,
            table(["", "Product", { label: "Shelf price", num: true }, { label: "With the Promotion", num: true }, { label: "Saving each", num: true }], products.map(productRow)),
            num(products.length),
          )}
    </div>
    ${section("Stores publishing it", storeList(stores), num(stores.length))}
  </div>`;
