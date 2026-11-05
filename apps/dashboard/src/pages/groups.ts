import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { ApiClient } from "#/api-client.ts";
import { shekels, size, SOLD_BY } from "#/pages/format.ts";
import { imageCell } from "#/pages/products.ts";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;
export type Group = InferResponseType<ApiClient["groups"]["$get"], 200>["groups"][number];

const MEASURE = { kg: "By the kilo", l: "By the liter", unit: "By the pack" } as const;
const PER = { kg: "a kilo", l: "a liter", unit: "a pack" } as const;
const groupsHref = (q: string) => `/groups?${new URLSearchParams({ q })}`;

/** The Product groups page: the words form, then the groups they name (or nothing before a search). */
export const groupsPage = (q: string, found: Html | "" = "") => html`<header>
    <h1>Product groups</h1>
  </header>
  <form method="get" action="/groups" class="search">
    <label for="q">Group words</label>
    <input id="q" name="q" type="search" value="${q}" maxlength="100" autofocus />
    <button type="submit">Search</button>
  </form>
  ${found}`;

/** One group: what defines it, its refinements (each a narrower search) and its members, cheapest first, with images. */
export const groupSection = (g: Group) => html`<section>
  <h2 lang="he">${g.name}</h2>
  <dl>
    <dt>Ref</dt>
    <dd lang="he">${g.ref}</dd>
    <dt>Measure</dt>
    <dd>${MEASURE[g.measure]}</dd>
    <dt>Sold by</dt>
    <dd>${SOLD_BY[g.soldBy]}</dd>
    <dt>Commonest pack</dt>
    <dd>${size(g)}</dd>
    <dt>Cheapest</dt>
    <dd>${shekels(g.minPrice)} ${PER[g.measure]}</dd>
    <dt>Members</dt>
    <dd>${g.productCount} Products, ${g.storeCount} stores</dd>
    <dt>Refinements</dt>
    <dd lang="he">
      ${g.refinements.length ? g.refinements.map((r) => html`<a href="${groupsHref(`${g.name} ${r}`)}">${r}</a> `) : html`<span class="muted">None</span>`}
    </dd>
  </dl>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">Image</th>
          <th scope="col">Product</th>
          <th scope="col">Size</th>
          <th scope="col">Sold by</th>
          <th scope="col">Cheapest</th>
          <th scope="col">Stores</th>
        </tr>
      </thead>
      <tbody>
        ${g.members.map(
          (m) => html`<tr>
            ${imageCell(m.code)}
            <td lang="he"><a href="/products/${encodeURIComponent(m.code)}">${m.name}</a></td>
            <td>${size(m)}</td>
            <td>${SOLD_BY[m.soldBy]}</td>
            <td>${shekels(m.minPrice)}</td>
            <td>${m.storeCount}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>
</section>`;
