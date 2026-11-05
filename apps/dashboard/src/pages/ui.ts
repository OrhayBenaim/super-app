// The dashboard's shared page parts (docs/design/dashboard.md, Components). Styles: pages/styles.ts.
import { html, raw } from "hono/html";
import type { Html } from "#/pages/layout.ts";

type Content = Html | string;
/** Extra attributes on a control (hx-post, form, ...). Names are written as given, so only pass literal ones. */
type Attrs = Record<string, string>;
const attrs = (a: Attrs = {}) => Object.entries(a).map(([k, v]) => html` ${raw(k)}="${v}"`);

/** The page header: breadcrumb (detail pages), Large Title, one summary line, the page's one primary action at the end. */
export const pageHeader = (p: { title: Content; summary?: Content; breadcrumb?: { href: string; text: string }; action?: Content }) => html`<header class="page-header">
  <div>
    ${p.breadcrumb ? html`<a class="breadcrumb" href="${p.breadcrumb.href}">${p.breadcrumb.text}</a>` : ""}
    <h1>${p.title}</h1>
    ${p.summary ? html`<p>${p.summary}</p>` : ""}
  </div>
  ${p.action ? html`<div class="page-action">${p.action}</div>` : ""}
</header>`;

/** A section header (with a count at its end) over a white inset group. */
export const section = (title: string, body: Content, count?: Content | number) => html`<section>
  <div class="section-header"><h2>${title}</h2>${count === undefined ? "" : html`<span>${count}</span>`}</div>
  <div class="group">${body}</div>
</section>`;

export type BadgeKind = "ok" | "failed" | "warning" | "interrupted" | "running" | "finished" | "skipped" | "requested" | "ignored";
export const badge = (kind: BadgeKind, text: string) => html`<span class="badge badge-${kind}">${text}</span>`;

type ButtonVariant = "filled" | "tinted" | "plain" | "destructive";
/** A button that names its action. A disabled one shows its reason next to it. */
export const button = (text: string, p: { variant?: ButtonVariant; type?: "button" | "submit"; disabled?: string; attrs?: Attrs } = {}) =>
  p.disabled
    ? html`<button type="button" class="button" disabled aria-describedby="${reasonId(text)}">${text}</button>
        <span class="reason" id="${reasonId(text)}">${p.disabled}</span>`
    : html`<button type="${p.type ?? "button"}" class="button button-${p.variant ?? "filled"}"${attrs(p.attrs)}>${text}</button>`;
const reasonId = (text: string) => `why-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** A column: a label, end-aligned when it holds numbers. */
export type Column = string | { label: string; num: true };
/** A table; each row's cells end-aligned with `<td class="num">` where their column is. */
export const table = (columns: Column[], rows: Content | Content[]) => html`<table>
  <thead>
    <tr>
      ${columns.map((c) => (typeof c === "string" ? html`<th scope="col">${c}</th>` : html`<th scope="col" class="num">${c.label}</th>`))}
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;

/** The note under a table row, across every column: red, or amber for what is degraded. Its row gets class "has-error". */
export const errorRow = (colspan: number, text: Content, tone: "failed" | "warning" = "failed") =>
  html`<tr class="error${tone === "warning" ? " warning" : ""}"><td colspan="${colspan}">${text}</td></tr>`;

/** Filter chips as links; the selected one is marked. Each shows its count. */
export const chips = (label: string, options: { text: string; count: number; href: string; selected?: boolean }[]) => html`<nav class="chips" aria-label="${label}">
  ${options.map(
    (o) => html`<a class="chip" href="${o.href}"${o.selected ? html` aria-current="true"` : ""}>${o.text} <span class="count">${o.count.toLocaleString("en-US")}</span></a>`,
  )}
</nav>`;

/** A select with its label above. */
export const select = (p: { label: string; name: string; options: { value: string; text: string }[]; value?: string; attrs?: Attrs }) => html`<label class="field">
  <span>${p.label}</span>
  <span class="select">
    <select name="${p.name}"${attrs(p.attrs)}>
      ${p.options.map((o) => html`<option value="${o.value}"${o.value === p.value ? html` selected` : ""}>${o.text}</option>`)}
    </select>
  </span>
</label>`;

/** An input with its label above; an error marks it invalid and shows under it. */
export const field = (p: { label: string; name: string; value?: string; error?: string; type?: string; attrs?: Attrs }) => html`<label class="field">
  <span>${p.label}</span>
  <input type="${p.type ?? "text"}" name="${p.name}" value="${p.value ?? ""}"${p.error ? html` aria-invalid="true" aria-describedby="${p.name}-error"` : ""}${attrs(p.attrs)} />
  ${p.error ? html`<span class="message" id="${p.name}-error">${p.error}</span>` : ""}
</label>`;
