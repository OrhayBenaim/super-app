import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { day, num, time, took } from "#/pages/format.ts";
import { chainOutcome } from "@grocer/shared/sync-history";
import { byOutcome, dueOf, outcomeBadge, runLength, SKIP_REASONS, statusBadge, TRIGGERS } from "#/pages/syncs.ts";
import { errorRow, pageHeader, section, table, type Column } from "#/pages/ui.ts";

type Run = InferResponseType<ApiClient["syncs"][":id"]["$get"], 200>;
type ChainResult = Run["chains"][number];

const COLUMNS: Column[] = [
  "Chain",
  "Outcome",
  { label: "Files", num: true },
  { label: "Stores", num: true },
  { label: "Prices", num: true },
  { label: "Geocoded", num: true },
  { label: "Promotions", num: true },
  { label: "Took", num: true },
];


/** Scheduled · 06:00 – 06:41 · 41 min · 12 of 15 Chains updated (a Chain whose Promotions failed still updated its prices). */
function summary({ sync, chains }: Run, now: Date) {
  const parts: string[] = [TRIGGERS[sync.trigger]];
  if (sync.skipReason) parts.push(SKIP_REASONS[sync.skipReason]);
  if (sync.startedAt) parts.push(`${time(sync.startedAt)} – ${sync.finishedAt ? time(sync.finishedAt) : "now"}`, runLength(sync, now));
  if (chains.length) parts.push(`${chains.filter((r) => r.status === "ok").length} of ${chains.length} Chains updated`);
  return parts.join(" · ");
}

const productTypes = ({ productTypes: p }: Run["sync"]) =>
  p
    ? html`<div class="counts">
        <span><strong>${num(p.typed)}</strong> Products given a type</span>
        <span><strong>${num(p.other)}</strong> typed as Other</span>
        <span><strong>${num(p.failedRequests)}</strong> failed requests</span>
      </div>`
    : html`<span class="muted">The Product type step did not run.</span>`;

// A Chain failure and a Promotion failure are separate states: a Chain can load its prices and still fail its Promotions.
function chainRow(r: ChainResult) {
  const errors = [
    r.error ? errorRow(COLUMNS.length, r.error) : "",
    r.promotionError ? errorRow(COLUMNS.length, `Promotions not loaded: ${r.promotionError}`, "warning") : "",
  ];
  return html`<tr${r.error || r.promotionError ? html` class="has-error"` : ""}>
      <td>${r.name}</td>
      <td>${outcomeBadge(r.status === "ok" ? "ok" : "failed")} ${r.promotionStatus === "failed" ? outcomeBadge("promotionFailed") : ""}</td>
      <td class="num">${num(r.filesDownloaded)}</td>
      <td class="num">${num(r.storesLoaded)}</td>
      <td class="num">${num(r.pricesLoaded)}</td>
      <td class="num">${num(r.storesGeocoded)}</td>
      <td class="num">${num(r.promotionsLoaded)}</td>
      <td class="num">${took(r.durationMs)}</td>
    </tr>
    ${errors}`;
}

/** One Price sync (A2): its outcome and times, the Product type step, and each Chain's result, failures first. */
export const syncRunPage = (run: Run, now: Date) => html`${pageHeader({
    breadcrumb: { href: "/", text: "Price syncs" },
    title: day(dueOf(run.sync), now),
    summary: summary(run, now),
    action: statusBadge(run.sync.status),
  })}
  ${section("Product types", html`<div class="group-body">${productTypes(run.sync)}</div>`)}
  ${run.chains.length
    ? section("Chains, failures first", table(COLUMNS, run.chains.toSorted(byOutcome(chainOutcome)).map(chainRow)), run.chains.length)
    : html`<p class="notice">No Chain results for this Price sync.</p>`}`;
