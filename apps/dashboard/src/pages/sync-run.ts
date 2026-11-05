import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { duration, elapsed, SKIP_REASONS, TRIGGERS, when } from "#/pages/syncs.ts";

type Run = InferResponseType<ApiClient["syncs"][":id"]["$get"], 200>;
type ChainResult = Run["chains"][number];

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, word: string) => `${count.format(n)} ${word}${n === 1 ? "" : "s"}`;

function productTypeStep({ productTypes: p }: Run["sync"]) {
  if (!p) return "The Product type step did not run.";
  return `${plural(p.typed, "Product")} typed, ${count.format(p.other)} as Other, ${plural(p.failedRequests, "failed request")}.`;
}

// A Chain failure and a Promotion failure are separate states: a Chain can load its prices and still fail its Promotions.
const chainOutcome = (r: ChainResult) =>
  r.status === "ok" ? html`<span class="badge badge-ok">ok</span>` : html`<span class="badge badge-failed">Chain failure</span>`;
const promotionOutcome = (r: ChainResult) =>
  r.promotionStatus === "failed"
    ? html`<span class="badge badge-failed">Promotion failure</span>`
    : r.promotionStatus === "ok"
      ? html`<span class="badge badge-ok">ok</span>`
      : html`<span class="muted">—</span>`;

const errors = (r: ChainResult) =>
  r.error || r.promotionError
    ? html`<tr class="errors">
        <td colspan="9">
          ${r.error ? html`<div>Chain failure: ${r.error}</div>` : ""}
          ${r.promotionError ? html`<div>Promotion failure: ${r.promotionError}</div>` : ""}
        </td>
      </tr>`
    : "";

const chainRows = (r: ChainResult) => html`<tr>
    <td>${r.name} <span class="muted" lang="he" dir="rtl">${r.nameHe}</span></td>
    <td>${chainOutcome(r)}</td>
    <td>${count.format(r.filesDownloaded)}</td>
    <td>${count.format(r.storesLoaded)}</td>
    <td>${count.format(r.pricesLoaded)}</td>
    <td>${count.format(r.storesGeocoded)}</td>
    <td>${count.format(r.promotionsLoaded)}</td>
    <td>${promotionOutcome(r)}</td>
    <td>${elapsed(r.durationMs)}</td>
  </tr>
  ${errors(r)}`;

/** One Price sync: its own outcome and times, the Product type step, and each Chain's result. */
export const syncRunPage = ({ sync, chains }: Run) => html`<header>
    <h1>Price sync #${sync.id}</h1>
    <a href="/">All Price syncs</a>
  </header>
  <dl>
    <dt>Trigger</dt>
    <dd>${TRIGGERS[sync.trigger]}</dd>
    <dt>Status</dt>
    <dd><span class="badge badge-${sync.status}">${sync.status}</span>${sync.skipReason ? html` <span class="muted">${SKIP_REASONS[sync.skipReason]}</span>` : ""}</dd>
    <dt>Due</dt>
    <dd>${when(sync.scheduledAt ?? sync.requestedAt)}</dd>
    <dt>Started</dt>
    <dd>${when(sync.startedAt)}</dd>
    <dt>Ended</dt>
    <dd>${when(sync.finishedAt)}</dd>
    <dt>Duration</dt>
    <dd>${duration(sync.startedAt, sync.finishedAt)}</dd>
    <dt>Product types</dt>
    <dd>${productTypeStep(sync)}</dd>
  </dl>
  ${chains.length === 0
    ? html`<p class="notice">No Chain results for this Price sync.</p>`
    : html`<div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Chain</th>
              <th scope="col">Outcome</th>
              <th scope="col">Files downloaded</th>
              <th scope="col">Stores loaded</th>
              <th scope="col">Prices loaded</th>
              <th scope="col">Stores geocoded</th>
              <th scope="col">Promotions loaded</th>
              <th scope="col">Promotions</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${chains.map(chainRows)}
          </tbody>
        </table>
      </div>`}`;
