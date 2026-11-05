import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";

type Sync = InferResponseType<ApiClient["syncs"]["$get"], 200>["syncs"][number];
export type Notice = "started" | "busy";

const TRIGGERS = { scheduled: "Scheduled", manual: "Manual" } as const;
const SKIP_REASONS = { manual_sync: "A Manual sync finished", sync_running: "A Price sync was running" } as const;
const NOTICES = { started: "Manual sync requested. The worker starts it within a minute.", busy: "A Price sync is already running or about to start." };

// Price syncs run on Israel time (SYNC_TIMES), so the dashboard shows it whatever the browser's zone.
const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "medium", timeStyle: "short" });
export const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

/** "4m 12s" under an hour, "2h 0m" from one; "—" until the sync has both a start and an end. */
function duration(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return "—";
  const s = Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000);
  return s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// Due: when it was scheduled, or requested for a Manual sync; a Skipped or Ignored sync has no start.
const row = (s: Sync) => html`<tr>
  <td>${when(s.scheduledAt ?? s.requestedAt)}</td>
  <td>${TRIGGERS[s.trigger]}</td>
  <td><span class="badge badge-${s.status}">${s.status}</span></td>
  <td class="muted">${s.skipReason ? SKIP_REASONS[s.skipReason] : ""}</td>
  <td>${when(s.startedAt)}</td>
  <td>${when(s.finishedAt)}</td>
  <td>${duration(s.startedAt, s.finishedAt)}</td>
</tr>`;

/** The history, swapped in place by the Manual sync button with its notice. */
export const syncsSection = (syncs: Sync[], notice?: Notice) => html`<section id="syncs">
  ${notice ? html`<p role="status" class="notice ${notice}">${NOTICES[notice]}</p>` : ""}
  ${syncs.length === 0
    ? html`<p class="notice">No Price syncs in the last 90 days.</p>`
    : html`<div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Due</th>
              <th scope="col">Trigger</th>
              <th scope="col">Status</th>
              <th scope="col">Skip reason</th>
              <th scope="col">Started</th>
              <th scope="col">Ended</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${syncs.map(row)}
          </tbody>
        </table>
      </div>`}
</section>`;

export const syncsPage = (syncs: Sync[]) => html`<header>
    <h1>Price syncs</h1>
    <button type="button" hx-post="/syncs" hx-target="#syncs" hx-swap="outerHTML">Start a Manual sync</button>
  </header>
  ${syncsSection(syncs)}`;
