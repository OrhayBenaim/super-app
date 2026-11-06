import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import { CHAIN_OUTCOMES, SYNC_HISTORY, type ChainOutcome } from "@grocer/shared/sync-history";
import type { ApiClient } from "#/api-client.ts";
import { day, isToday, minutes, plural, shortDate, time, weekday } from "#/pages/format.ts";
import { badge, button, outcomeBadge, pageHeader, section, table, type BadgeKind } from "#/pages/ui.ts";

export type Syncs = InferResponseType<ApiClient["syncs"]["$get"], 200>;
type Sync = Syncs["syncs"][number];
type Attention = Syncs["attention"][number];
type Status = Sync["status"];
export type Notice = "started" | "busy";

export const TRIGGERS = { scheduled: "Scheduled", manual: "Manual" } as const;
const STATUSES = {
  requested: "Requested",
  running: "Running",
  finished: "Finished",
  interrupted: "Interrupted",
  skipped: "Skipped",
  ignored: "Ignored",
} as const satisfies Record<Status, string>;
export const SKIP_REASONS = { manual_sync: "A Manual sync had just finished", sync_running: "A Price sync was running" } as const;
const NOTICES = { started: "Manual sync requested. The worker starts it within a minute.", busy: "A Price sync is already running or about to start." };
const DAY = 86_400_000;

/** A run's status badge: its own state, so a run that finished with failures is Finished, never green. */
export const statusBadge = (s: Status) => badge(s, STATUSES[s]);
/** A Chain's outcome in a Price sync (chainOutcome), badged the same on every page. */
/** Failures first, then Promotion failures, then the rest. */
export const byOutcome = <T>(outcome: (t: T) => ChainOutcome) => (a: T, b: T) => CHAIN_OUTCOMES.indexOf(outcome(a)) - CHAIN_OUTCOMES.indexOf(outcome(b));
/** When it was due: scheduled, or requested for a Manual sync. */
export const dueOf = (s: Pick<Sync, "scheduledAt" | "requestedAt">) => s.scheduledAt ?? s.requestedAt;

/** The run's length; for a running one, how long so far; "—" before it starts. */
export function runLength(s: Pick<Sync, "status" | "startedAt" | "finishedAt">, now: Date) {
  if (!s.startedAt) return "—";
  if (s.status === "running") return `${minutes(now.getTime() - Date.parse(s.startedAt))} so far`;
  return s.finishedAt ? minutes(Date.parse(s.finishedAt) - Date.parse(s.startedAt)) : "—";
}

/** The strip's colour for a run: its worst Chain outcome. Requested and Ignored runs never ran, so they have none. */
function stripKind(s: Sync): "ok" | "warning" | "failed" | "skipped" | "running" | null {
  if (s.status === "requested" || s.status === "ignored") return null;
  if (s.status === "running" || s.status === "skipped") return s.status;
  if (s.chains.failed) return "failed";
  return s.chains.promotionFailed || s.status === "interrupted" ? "warning" : "ok";
}

const busyOf = (syncs: Sync[]) => syncs.find((s) => s.status === "running") ?? syncs.find((s) => s.status === "requested");

function manualSync(syncs: Sync[]) {
  const busy = busyOf(syncs);
  if (busy) return button("Start a Manual sync", { disabled: busy.status === "running" ? "One is running now" : "One starts within a minute" });
  return button("Start a Manual sync", { attrs: { "hx-post": "/syncs", "hx-target": "#syncs-page", "hx-swap": "outerHTML" } });
}

/** The api's next Scheduled sync: "at 12:30" today, else "on Sunday at 07:00". */
function summary(syncs: Sync[], nextScheduledAt: string, now: Date) {
  const next = `Scheduled sync ${isToday(nextScheduledAt, now) ? "" : `on ${weekday(nextScheduledAt)} `}at ${time(nextScheduledAt)}`;
  const busy = busyOf(syncs);
  return busy ? `A ${TRIGGERS[busy.trigger]} sync is ${busy.status} · next ${next}` : `Next ${next}`;
}

/** Day labels under the strip: its first day, each month's first, and Now. */
function axis(start: number, now: Date) {
  const at = (t: number) => ((t - start) / (now.getTime() - start)) * 100;
  const months: number[] = [];
  for (let t = start + DAY; t < now.getTime(); t += DAY) if (shortDate(new Date(t)).endsWith(" 1") && at(t) > 6 && at(t) < 96) months.push(t);
  return html`<div class="axis" aria-hidden="true">
    <span style="inset-inline-start: 0">${shortDate(new Date(start))}</span>
    ${months.map((t) => html`<span style="inset-inline-start: ${at(t).toFixed(2)}%">${shortDate(new Date(t))}</span>`)}
    <span style="inset-inline-start: 100%">Now</span>
  </div>`;
}

/** The 90-day strip: one tick per run, oldest first, placed by when it was due. */
function strip(syncs: Sync[], attention: Attention[], now: Date) {
  const start = now.getTime() - SYNC_HISTORY.days * DAY;
  const ticks = syncs.toReversed().flatMap((s) => {
    const kind = stripKind(s);
    if (!kind) return [];
    const at = Math.min(((Date.parse(dueOf(s)) - start) / (now.getTime() - start)) * 100, 99.7);
    const label = `${day(dueOf(s), now)}: ${STATUSES[s.status]}`;
    return [html`<a class="tick tick-${kind}" href="/syncs/${s.id}" style="inset-inline-start: ${at.toFixed(2)}%" title="${label}" aria-label="${label}"></a>`];
  });
  if (!ticks.length) return "";
  // A Chain failing in every run since a date is called out: the longest such one (attention lists the longest first).
  const stuck = attention.find((a) => a.failure === "failed" && a.runs > 1);
  return html`<section class="group group-body" aria-label="Last ${SYNC_HISTORY.days} days">
    <div class="strip-head">
      <h2>Last ${SYNC_HISTORY.days} days</h2>
      <div class="legend">
        <span class="key-ok">Every Chain ok</span>
        <span class="key-warning">Promotion failure or interrupted</span>
        <span class="key-failed">Chain failure</span>
        <span class="key-skipped">Skipped</span>
      </div>
    </div>
    ${stuck ? html`<p class="callout">${stuck.name} has failed in every run since ${shortDate(stuck.since)}</p>` : ""}
    <div class="ticks">${ticks}</div>
    ${axis(start, now)}
  </section>`;
}

const OUTCOMES = { failed: "Prices not updated", promotionFailed: "Prices updated, Promotions not loaded" } as const;

// Outcome first, then the raw error; the row opens the latest run that failed the Chain.
const attentionRow = (a: Attention, now: Date) => html`<li>
  <a href="/syncs/${a.syncId}">
    <span>${outcomeBadge(a.failure, a.failure === "failed" ? "Chain failure" : undefined)}</span>
    <span>
      <strong>${a.name}</strong> <span class="muted" lang="he" dir="rtl">${a.nameHe}</span> · ${OUTCOMES[a.failure]}
      <br /><span class="footnote muted">${a.error ?? ""}</span>
    </span>
    <span class="footnote muted">${a.runs > 1 ? `Since ${shortDate(a.since)} · ${a.runs} runs` : day(a.since, now)}</span>
  </a>
</li>`;

function chainsCell(s: Sync) {
  const { ok, failed, promotionFailed } = s.chains;
  if (s.skipReason) return html`<span class="muted">${SKIP_REASONS[s.skipReason]}</span>`;
  if (s.status === "running") return `${plural(ok + failed + promotionFailed, "Chain")} done`;
  if (ok + failed + promotionFailed === 0) return "—";
  return html`${ok} ok${failed ? html` <span class="failed">· ${failed} failed</span>` : ""}${
    promotionFailed ? html` <span class="warn">· ${plural(promotionFailed, "Promotion failure")}</span>` : ""
  }`;
}

const historyRow = (s: Sync, now: Date) => html`<tr>
  <td><a href="/syncs/${s.id}">${day(dueOf(s), now)}</a></td>
  <td>${TRIGGERS[s.trigger]}</td>
  <td>${statusBadge(s.status)}</td>
  <td>${runLength(s, now)}</td>
  <td>${chainsCell(s)}</td>
</tr>`;

/** The Price syncs home (A1), swapped whole by the Manual sync button with its notice. */
export const syncsPage = ({ syncs, attention, nextScheduledAt }: Syncs, now: Date, notice?: Notice) => html`<div id="syncs-page">
  ${pageHeader({ title: "Price syncs", summary: summary(syncs, nextScheduledAt, now), action: manualSync(syncs) })}
  ${notice ? html`<p role="status" class="notice ${notice}">${NOTICES[notice]}</p>` : ""}
  ${strip(syncs, attention, now)}
  ${attention.length ? section("Needs attention", html`<ul class="attention">${attention.map((a) => attentionRow(a, now))}</ul>`, attention.length) : ""}
  ${syncs.length
    ? section("History", table(["Due", "Trigger", "Status", "Duration", "Chains"], syncs.map((s) => historyRow(s, now))), `${syncs.length} in the last ${SYNC_HISTORY.days} days`)
    : html`<p class="notice">No Price syncs in the last ${SYNC_HISTORY.days} days.</p>`}
</div>`;
