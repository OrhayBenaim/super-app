import type { InferResponseType } from "hono/client";
import { html } from "hono/html";
import type { ApiClient } from "#/api-client.ts";
import { day, num, plural } from "#/pages/format.ts";
import { badge, errorRow, pageHeader, section, table, type Column } from "#/pages/ui.ts";

type Chain = InferResponseType<ApiClient["chains"]["$get"], 200>["chains"][number];

const COLUMNS: Column[] = ["Chain", "Last Price sync", "Last good sync", { label: "Stores", num: true }, { label: "No location", num: true }, ""];

// Chain failures, then Promotion failures, then the rest (the api lists them by name).
const rank = (c: Chain) => (c.lastStatus === "failed" ? 0 : c.lastPromotionStatus === "failed" ? 1 : 2);

function outcome(c: Chain) {
  if (c.lastStatus === null) return html`<span class="muted">No Price sync yet</span>`;
  if (c.lastStatus === "failed") return badge("failed", "Failed");
  return c.lastPromotionStatus === "failed" ? badge("warning", "Promotion failure") : badge("ok", "Ok");
}

function row(now: Date) {
  return (c: Chain) => {
    const error = c.lastStatus === "failed" ? c.lastError : null;
    return html`<tr${error ? html` class="has-error"` : ""}>
        <td>${c.name} <span lang="he" dir="rtl" class="muted">${c.nameHe}</span></td>
        <td>${outcome(c)}</td>
        <td>${c.lastGoodSyncAt ? day(c.lastGoodSyncAt, now) : html`<span class="muted">Never</span>`}</td>
        <td class="num">${num(c.stores)}</td>
        <td class="num ${c.storesWithoutLocation ? "warn" : "muted"}">${num(c.storesWithoutLocation)}</td>
        <td class="num">${c.stores ? html`<a href="/stores?chain=${c.id}">Stores</a>` : ""}</td>
      </tr>
    ${error ? errorRow(COLUMNS.length, error) : ""}`;
  };
}

/** Every Chain (A3), failing first, so a stale one (failed, old last good sync) or a weak one (stores without location) stands out. */
export function chainsPage(chains: Chain[], now: Date) {
  const failing = chains.filter((c) => c.lastStatus === "failed").length;
  const unplaced = chains.reduce((n, c) => n + c.storesWithoutLocation, 0);
  return html`${pageHeader({ title: "Chains", summary: `${plural(chains.length, "Chain")} · ${num(failing)} failing · ${plural(unplaced, "store")} without a location` })}
    ${section("Failing first", table(COLUMNS, chains.toSorted((a, b) => rank(a) - rank(b)).map(row(now))), chains.length)}`;
}
