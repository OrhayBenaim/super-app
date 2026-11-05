import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { when } from "#/pages/syncs.ts";

type Chain = InferResponseType<ApiClient["chains"]["$get"], 200>["chains"][number];

const row = (c: Chain) => html`<tr>
  <td><a href="/stores?chain=${c.id}">${c.name}</a> <span lang="he" dir="rtl" class="muted">${c.nameHe}</span></td>
  <td>${c.lastStatus ? html`<span class="badge badge-outcome-${c.lastStatus}">${c.lastStatus}</span>` : html`<span class="muted">No Price sync yet</span>`}</td>
  <td>${when(c.lastGoodSyncAt)}</td>
  <td>${c.stores}</td>
  <td>${c.storesWithoutLocation}</td>
</tr>`;

/** Every Chain, so a stale one (failed, old last good sync) or a weak one (stores without location) stands out. */
export const chainsPage = (chains: Chain[]) => html`<header><h1>Chains</h1></header>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">Chain</th>
          <th scope="col">Last Price sync</th>
          <th scope="col">Last good sync</th>
          <th scope="col">Stores</th>
          <th scope="col">No location</th>
        </tr>
      </thead>
      <tbody>
        ${chains.map(row)}
      </tbody>
    </table>
  </div>`;
