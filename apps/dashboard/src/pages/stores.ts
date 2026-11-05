import type { InferResponseType } from "hono/client";
import { html, raw } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { day, num, plural } from "#/pages/format.ts";
import { badge, button, chips, field, pageHeader, section, table } from "#/pages/ui.ts";

type List = InferResponseType<ApiClient["stores"]["$get"], 200>;
type Store = List["stores"][number];
type StoreDetail = InferResponseType<ApiClient["stores"][":id"]["$get"], 200>["store"];
type Chain = InferResponseType<ApiClient["chains"]["$get"], 200>["chains"][number];
export type Filter = { chain?: string; noLocation?: string; publishedDiffers?: string };
/** The edit form's fields as typed, so a refused edit shows them again. */
export type Edit = { name: string; address: string; city: string; lat: string; lng: string };
/** A refused edit: what was typed, why, and the field it is about (null for none). */
export type Refused = { edit: Edit; error: string; field: keyof Edit | null };

export const storeHref = (id: string) => `/stores/${encodeURIComponent(id)}`;
/** "/stores?chain=…&noLocation=true", leaving out what is unset. */
const storesHref = (q: Record<string, string | undefined>) => {
  const query = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return query ? `/stores?${query}` : "/stores";
};

const empty = html`<span class="muted">—</span>`;
// A city the Chain published as a number is a code, not a name: amber, for the operator to correct.
const row = (s: Store) => html`<tr>
  <td><a href="${storeHref(s.id)}" dir="auto">${s.name}</a></td>
  <td>${s.chainName}</td>
  <td><span dir="auto">${s.address || empty}</span></td>
  ${/^\d+$/.test(s.city) ? html`<td class="warn">${s.city}</td>` : html`<td><span dir="auto">${s.city || empty}</span></td>`}
</tr>`;

/** Stores as the Stores page lists them: name (linking to the store), Chain, address and city. */
export const storesTable = (stores: Store[]) => table(["Store", "Chain", "Address", "City"], stores.map(row));
/**
 * The find field's stores, above its Products: nothing when no store name holds the words. The api's first page (100)
 * scrolls in a box, and more matches than that say so: typing more narrows them.
 */
export const storesFound = (list: { stores: Store[]; total: number }) => {
  if (!list.stores.length) return "";
  const count = list.total > list.stores.length ? `Showing ${num(list.stores.length)} of ${plural(list.total, "store")} · type more to narrow it down` : plural(list.total, "store");
  return section("Stores", html`<div class="find-stores">${storesTable(list.stores)}</div>`, count);
};

/** "1–100 of 399", the note on cities, and previous/next links that keep the filter. */
function tableFoot(list: List, filter: Filter) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const first = (list.page - 1) * list.pageSize;
  const href = (page: number) => storesHref({ ...filter, page: String(page) });
  return html`<nav class="table-foot" aria-label="Pages">
    <span>${num(first + 1)}–${num(first + list.stores.length)} of ${num(list.total)} · a city that is a number is a code the Chain published</span>
    <span class="pages">
      ${list.page > 1 ? html`<a href="${href(list.page - 1)}">Previous</a>` : ""} ${list.page < pages ? html`<a href="${href(list.page + 1)}">Next</a>` : ""}
    </span>
  </nav>`;
}

const TILES = raw(`L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);`);

// Points come from a data attribute (escaped by html``) and tooltips are built as text, so a store's name is never markup.
const MAP_SCRIPT = html`<script>
  addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("map");
    const points = JSON.parse(el.dataset.stores);
    const map = L.map(el).setView([31.5, 34.9], 7);
    const color = getComputedStyle(el).getPropertyValue("--tint"); // the tokens stylesheet's, as no colour is written here
    ${TILES}
    for (const p of points) {
      const link = document.createElement("a");
      link.href = "/stores/" + encodeURIComponent(p.id);
      link.textContent = p.name;
      L.circleMarker([p.lat, p.lng], { radius: 4, color, weight: 1, fillOpacity: 0.8 }).bindPopup(link).addTo(map);
    }
    if (points.length) map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [24, 24], maxZoom: 15 });
  });
</script>`;

/** The map of the filtered stores that have a location, and how many are left off it. */
function mapPanel(list: List) {
  const unplaced = list.total - list.locations.length;
  return html`<section class="map-panel" aria-label="Map">
    <div class="map-head">
      <strong>${plural(list.locations.length, "placed store")}</strong>
      ${unplaced ? html`<span>${num(unplaced)} ${unplaced === 1 ? "has no location, so is not" : "have no location, so are not"} on the map</span>` : ""}
    </div>
    <div id="map" role="region" aria-label="Map of the stores that have a location" data-stores="${JSON.stringify(list.locations)}"></div>
  </section>`;
}

/** Stores (A4): the Chain and a filter chip, one page of the stores in a table, and the map beside it. */
export function storesPage(list: List, chains: Chain[], filter: Filter) {
  const chain = chains.find((c) => c.id === filter.chain);
  const where = chain ? chain.name : plural(chains.filter((c) => c.stores > 0).length, "Chain");
  const on = filter.noLocation === "true" ? "noLocation" : filter.publishedDiffers === "true" ? "publishedDiffers" : "all";
  const chip = (key: typeof on, text: string) => ({
    text,
    count: list.counts[key],
    href: storesHref({ chain: filter.chain, ...(key !== "all" && { [key]: "true" }) }),
    selected: on === key,
  });
  return html`${pageHeader({ title: "Stores", summary: `${plural(list.counts.all, "store")} in ${where}` })}
    <link rel="stylesheet" href="/assets/leaflet.css" />
    <script src="/assets/leaflet.js" defer></script>
    <form class="toolbar" method="get" action="/stores">
      <span class="select">
        <select name="chain" aria-label="Chain" onchange="this.form.submit()">
          <option value="">All Chains</option>
          ${chains.map((c) => html`<option value="${c.id}"${c.id === filter.chain ? html` selected` : ""}>${c.name}</option>`)}
        </select>
      </span>
      ${on === "all" ? "" : html`<input type="hidden" name="${on}" value="true" />`}
      ${chips("Filter", [chip("all", "All"), chip("noLocation", "No location"), chip("publishedDiffers", "Address differs")])}
    </form>
    <div class="stores">
      <div>
        ${list.stores.length === 0
          ? html`<p class="notice">No stores match.</p>`
          : html`<div class="group">${storesTable(list.stores)}</div>
              ${tableFoot(list, filter)}`}
      </div>
      ${mapPanel(list)}
    </div>
    ${MAP_SCRIPT}`;
}

const differs = (s: StoreDetail) => s.address !== s.publishedAddress || s.city !== s.publishedCity;

/** Grocer's address next to the one the Chain publishes now, for the operator to decide which is right (ADR 0006). */
const addresses = (s: StoreDetail) => html`<section class="group group-body differs">
  <h2>${badge("warning", "Address differs")} ${s.chainName} now publishes a different address for this store</h2>
  <div class="addresses">
    <div>
      <span>Grocer has</span>
      <strong dir="auto">${s.address}</strong>
      <span dir="auto">${s.city}</span>
    </div>
    <div>
      <span>${s.chainName} publishes</span>
      <strong dir="auto">${s.publishedAddress}</strong>
      <span dir="auto">${s.publishedCity}</span>
    </div>
  </div>
  <p>
    ${button("Copy into the form", { variant: "tinted", attrs: { id: "copy", "data-address": s.publishedAddress, "data-city": s.publishedCity } })}
    <span class="footnote muted">Fills Address and City below. Nothing changes until you save.</span>
  </p>
</section>`;

/** The saved location on a map whose pin, dragged, fills Latitude and Longitude. */
const pinMap = (s: StoreDetail) =>
  s.lat === null || s.lng === null
    ? html`<p class="pin-map footnote muted">No location. The next Price sync places the store from its address.</p>`
    : html`<div class="pin-map">
        <div id="pin" role="region" aria-label="The store's saved location" data-lat="${s.lat}" data-lng="${s.lng}"></div>
        <p class="footnote muted">Saved location · drag the pin to move it</p>
      </div>`;

// "Copy into the form" and the pin write into the form; nothing is saved until Save changes.
const EDIT_SCRIPT = html`<script>
  addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("edit");
    const input = (name) => form.elements.namedItem(name);
    const copy = document.getElementById("copy");
    copy?.addEventListener("click", () => {
      input("address").value = copy.dataset.address;
      input("city").value = copy.dataset.city;
      input("address").focus();
    });
    const el = document.getElementById("pin");
    if (!el) return;
    const at = [Number(el.dataset.lat), Number(el.dataset.lng)];
    const map = L.map(el).setView(at, 16);
    ${TILES}
    L.marker(at, { draggable: true, icon: L.divIcon({ className: "pin", iconSize: [14, 14] }) })
      .addTo(map)
      .on("dragend", (e) => {
        const p = e.target.getLatLng();
        input("lat").value = p.lat.toFixed(6);
        input("lng").value = p.lng.toFixed(6);
      });
  });
</script>`;

/** The operator's correction of the store, kept by every later Price sync (ADR 0006). A refused one shows why under its field. */
function editForm(s: StoreDetail, v: Edit, refused?: Refused) {
  const input = (label: string, name: keyof Edit, attrs: Record<string, string>) =>
    field({ label, name, value: v[name], error: refused?.field === name ? refused.error : undefined, attrs });
  return html`<form id="edit" class="edit" method="post" action="${storeHref(s.id)}">
    <div class="edit-fields">
      ${refused && !refused.field ? html`<p class="message" role="alert">${refused.error}</p>` : ""}
      ${input("Name", "name", { required: "", maxlength: "200", dir: "auto" })}
      <div class="row address-row">${input("Address", "address", { maxlength: "200", dir: "auto" })} ${input("City", "city", { maxlength: "100", dir: "auto" })}</div>
      <div class="row">${input("Latitude", "lat", { inputmode: "decimal" })} ${input("Longitude", "lng", { inputmode: "decimal" })}</div>
      <p class="footnote muted">A Price sync never changes these. Clear both coordinates and the next Price sync places the store from its address.</p>
      <div class="actions">${button("Save changes", { type: "submit" })} <a class="button button-plain" href="${storeHref(s.id)}">Cancel</a></div>
    </div>
    ${pinMap(s)}
  </form>`;
}

const editOf = (s: StoreDetail): Edit => ({ name: s.name, address: s.address, city: s.city, lat: s.lat === null ? "" : String(s.lat), lng: s.lng === null ? "" : String(s.lng) });

/** "Rami Levy · store 1 · 4,812 prices · last updated today 06:12" */
function summary(s: StoreDetail, now: Date) {
  const updated = s.pricesUpdatedAt && day(s.pricesUpdatedAt, now).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase());
  return [s.chainName, `store ${s.storeId}`, plural(s.priceCount, "price"), ...(updated ? [`last updated ${updated}`] : [])].join(" · ");
}

/** One store (A5): what Grocer has against what the Chain publishes when they differ, and the edit form. */
export const storePage = (s: StoreDetail, now: Date, refused?: Refused) => html`${pageHeader({
    breadcrumb: { href: "/stores", text: "Stores" },
    title: s.name,
    summary: summary(s, now),
    action: html`<a class="button button-tinted" href="/promotions?store=${s.id}">Promotions · ${num(s.promotionCount)}</a>`,
  })}
  <link rel="stylesheet" href="/assets/leaflet.css" />
  <script src="/assets/leaflet.js" defer></script>
  ${differs(s) ? addresses(s) : ""}
  ${section("Details", editForm(s, refused?.edit ?? editOf(s), refused))}
  ${EDIT_SCRIPT}`;
