import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { when } from "#/pages/syncs.ts";

type List = InferResponseType<ApiClient["stores"]["$get"], 200>;
type Store = List["stores"][number];
type StoreDetail = InferResponseType<ApiClient["stores"][":id"]["$get"], 200>["store"];
type Chain = InferResponseType<ApiClient["chains"]["$get"], 200>["chains"][number];
export type Filter = { chain?: string; noLocation?: string };

const location = (s: { lat: number | null; lng: number | null }) =>
  s.lat === null || s.lng === null ? html`<span class="muted">No location</span>` : `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
const storeHref = (id: string) => `/stores/${encodeURIComponent(id)}`;

const row = (s: Store) => html`<tr>
  <td><a href="${storeHref(s.id)}">${s.name}</a></td>
  <td>${s.chainName}</td>
  <td>${s.address}</td>
  <td>${s.city}</td>
  <td>${location(s)}</td>
</tr>`;

/** Previous/next links that keep the filter. */
function pager(list: List, filter: Filter) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (page: number) => `/stores?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), page: String(page) })}`;
  return html`<nav class="pages" aria-label="Pages">
    ${list.page > 1 ? html`<a href="${href(list.page - 1)}">Previous</a>` : ""}
    <span class="muted">Page ${list.page} of ${pages} · ${list.total} stores</span>
    ${list.page < pages ? html`<a href="${href(list.page + 1)}">Next</a>` : ""}
  </nav>`;
}

// Points come from a data attribute (escaped by html``) and tooltips are built as text, so a store's name is never markup.
const MAP_SCRIPT = html`<script>
  addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("map");
    const points = JSON.parse(el.dataset.stores);
    const map = L.map(el).setView([31.5, 34.9], 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    for (const p of points) {
      const link = document.createElement("a");
      link.href = "/stores/" + encodeURIComponent(p.id);
      link.textContent = p.name;
      L.circleMarker([p.lat, p.lng], { radius: 6, color: "#1f6f43", weight: 2, fillOpacity: 0.6 }).bindPopup(link).addTo(map);
    }
    if (points.length) map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [24, 24], maxZoom: 15 });
  });
</script>`;

/** The filter, a map of the filtered stores that have a location, and one page of them in a table. */
export const storesPage = (list: List, chains: Chain[], filter: Filter) => html`<header><h1>Stores</h1></header>
  <link rel="stylesheet" href="/assets/leaflet.css" />
  <script src="/assets/leaflet.js" defer></script>
  <form class="filters" method="get" action="/stores">
    <label
      >Chain
      <select name="chain">
        <option value="">All Chains</option>
        ${chains.map((c) => html`<option value="${c.id}"${c.id === filter.chain ? html` selected` : ""}>${c.name}</option>`)}
      </select></label
    >
    <label><input type="checkbox" name="noLocation" value="true"${filter.noLocation === "true" ? html` checked` : ""} /> No location</label>
    <button type="submit">Filter</button>
  </form>
  <div id="map" role="region" aria-label="Map of the stores that have a location" data-stores="${JSON.stringify(list.locations)}"></div>
  ${MAP_SCRIPT}
  ${list.stores.length === 0
    ? html`<p class="notice">No stores match.</p>`
    : html`<div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Store</th>
              <th scope="col">Chain</th>
              <th scope="col">Address</th>
              <th scope="col">City</th>
              <th scope="col">Location</th>
            </tr>
          </thead>
          <tbody>
            ${list.stores.map(row)}
          </tbody>
        </table>
      </div>`}
  ${pager(list, filter)}`;

/** One store: its details, how many prices it has and when they were last updated (a store that stopped publishing). */
export const storePage = (s: StoreDetail) => html`<header><h1>${s.name}</h1></header>
  <dl class="details">
    <dt>Chain</dt>
    <dd><a href="/stores?chain=${s.chainId}">${s.chainName}</a></dd>
    <dt>Store id</dt>
    <dd>${s.storeId}</dd>
    <dt>Address</dt>
    <dd>${s.address}</dd>
    <dt>City</dt>
    <dd>${s.city}</dd>
    <dt>Location</dt>
    <dd>${location(s)}</dd>
    <dt>Prices</dt>
    <dd>${s.priceCount}</dd>
    <dt>Prices last updated</dt>
    <dd>${when(s.pricesUpdatedAt)}</dd>
  </dl>`;
