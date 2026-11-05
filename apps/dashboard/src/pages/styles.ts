// The dashboard's one stylesheet (served at /assets/dashboard.css). Every colour, space and radius comes from
// docs/design/tokens.json as a custom property; nothing else in the dashboard writes a colour (docs/design/dashboard.md).
import tokens from "../../../../docs/design/tokens.json" with { type: "json" };

const vars = [
  ...Object.entries(tokens.color).map(([k, v]) => `--${k}: ${v};`),
  ...tokens.space.map((v, i) => `--space-${i}: ${v}px;`),
  ...Object.entries(tokens.radius).map(([k, v]) => `--radius-${k}: ${v}px;`),
  ...Object.entries(tokens.font.size).map(([k, v]) => `--font-${k}: ${v}px/${tokens.font.lineHeight[k as keyof typeof tokens.font.lineHeight]}px;`),
].join("\n  ");

// State colours (dashboard only): green ok, red failed, amber degraded or needs a look. Tint only for what you can press.
const tinted = (color: string, percent: number) => `color-mix(in srgb, var(--${color}) ${percent}%, transparent)`;

export const stylesheet = `:root {
  ${vars}
  --family: -apple-system, system-ui, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font: var(--font-subhead) var(--family); color: var(--label); background: var(--groupedBg); font-variant-numeric: tabular-nums; }
a { color: var(--tint); text-decoration: none; }
a:hover { text-decoration: underline; }
:focus-visible { outline: 2px solid var(--tint); outline-offset: 2px; }
.muted { color: var(--labelSecondary); }
.footnote { font: var(--font-footnote) var(--family); }

/* Top bar */
.topbar { display: flex; align-items: center; gap: var(--space-6); height: 57px; padding: 0 var(--space-8); background: var(--surface); border-bottom: 1px solid var(--separator); }
.brand { font-weight: 700; font-size: var(--font-headline); color: var(--label); white-space: nowrap; }
.brand span { font-weight: 400; font-size: 15px; color: var(--labelSecondary); margin-inline-start: var(--space-2); }
.topbar nav { display: flex; gap: var(--space-1); }
.topbar nav a { display: inline-flex; align-items: center; height: 36px; padding: 0 var(--space-4); border-radius: 8px; color: var(--label); white-space: nowrap; }
.topbar nav a[aria-current="page"] { color: var(--tint); font-weight: 600; background: var(--tintSoft); }
.find { margin-inline-start: auto; position: relative; }
.find::before { content: ""; position: absolute; inset-inline-start: var(--space-4); top: 10px; width: 16px; height: 16px; background: var(--labelSecondary); mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6'%3E%3Ccircle cx='7' cy='7' r='5.2'/%3E%3Cpath d='m11 11 3.5 3.5'/%3E%3C/svg%3E") center / contain no-repeat; }
.find input { width: 280px; height: 36px; padding: 0 var(--space-4) 0 36px; border: 0; border-radius: var(--radius-control); background: var(--fillControl); font: inherit; color: var(--label); }
.find input::placeholder { color: var(--labelSecondary); }

/* Page */
main { max-width: 1120px; margin: 0 auto; padding: var(--space-8) 0 var(--space-10); }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-6); margin-bottom: var(--space-7); }
.page-header h1 { font: var(--font-largeTitle) var(--family); font-weight: 700; letter-spacing: 0.4px; margin: 0; }
.page-header p { margin: var(--space-1) 0 0; color: var(--labelSecondary); }
.breadcrumb { font-weight: 500; }
.page-action { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); }
.section-header { display: flex; justify-content: space-between; margin: var(--space-7) var(--space-5) var(--space-3); font: var(--font-footnote) var(--family); color: var(--labelSecondary); }
.section-header h2 { font: inherit; margin: 0; }
.group, .scroll { background: var(--surface); border-radius: var(--radius-group); overflow-x: auto; }
.group-body { padding: var(--space-5); }
.notice { margin: var(--space-5) 0 0; padding: var(--space-4) var(--space-5); border-radius: var(--radius-group); background: var(--surface); }
.notice.busy { color: var(--warning); }

/* Badges: pill, 13px semibold */
.badge { display: inline-flex; align-items: center; gap: var(--space-2); padding: 2px var(--space-3); border-radius: var(--radius-full); font-size: 13px; line-height: 18px; font-weight: 600; white-space: nowrap; border: 1px solid transparent; }
.badge-ok { color: var(--saving); background: ${tinted("saving", 12)}; }
.badge-failed { color: var(--danger); background: ${tinted("danger", 10)}; }
.badge-warning { color: var(--warning); background: ${tinted("warning", 12)}; }
.badge-interrupted { color: var(--warning); border-color: var(--warning); }
.badge-running { color: var(--label); background: var(--fillControl); }
.badge-running::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.badge-finished { color: var(--label); border-color: var(--separator); }
.badge-skipped { color: var(--labelSecondary); background: var(--fillControl); }
.badge-requested { color: var(--labelSecondary); border: 1px dashed var(--controlOutline); }
.badge-ignored { color: var(--labelSecondary); border: 1px dotted var(--controlOutline); }

/* Buttons: 36 tall, radius 10, 15px semibold */
.button { display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 var(--space-5); border: 0; border-radius: var(--radius-control); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
.button-filled { background: var(--tint); color: var(--tintOn); }
.button-tinted { background: var(--tintSoft); color: var(--tint); }
.button-plain { background: none; color: var(--tint); padding: 0 var(--space-2); }
.button-destructive { background: none; color: var(--danger); padding: 0 var(--space-2); }
.button:disabled { background: var(--fillControl); color: var(--labelSecondary); cursor: default; }
.reason { font-size: 13px; color: var(--labelSecondary); }

/* Tables: 13px headers, 15px rows about 44 tall, hairline between rows, numbers end-aligned */
table { width: 100%; border-collapse: collapse; }
th, td { padding: var(--space-4) var(--space-5); text-align: start; vertical-align: top; border-bottom: 1px solid var(--separator); white-space: nowrap; }
th { font: var(--font-footnote) var(--family); font-weight: 500; color: var(--labelSecondary); }
tbody tr:last-child td { border-bottom: 0; }
th.num, td.num { text-align: end; }
tr.has-error td { border-bottom: 0; padding-bottom: var(--space-2); }
tr.error td { padding-top: 0; white-space: normal; font-size: 13px; color: var(--danger); }
tr.error.warning td { color: var(--warning); }
.failed { color: var(--danger); }
.warn { color: var(--warning); }

/* Filter chips */
.chips { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.chip { display: inline-flex; gap: var(--space-2); align-items: center; height: 32px; padding: 0 var(--space-4); border-radius: var(--radius-full); background: var(--surface); border: 1px solid var(--separator); color: var(--label); }
.chip[aria-current="true"] { background: var(--tintSoft); border-color: transparent; color: var(--tint); }
.chip .count { color: var(--labelSecondary); }
.chip[aria-current="true"] .count { color: inherit; }

/* Selects and inputs: label above, white, hairline, radius 10; an invalid one gets a red border and its message under it */
.field { display: flex; flex-direction: column; gap: var(--space-2); }
.field > span { font-size: 13px; font-weight: 500; color: var(--labelSecondary); }
.field input, .field select { height: 38px; padding: 0 var(--space-4); border: 1px solid var(--separator); border-radius: var(--radius-control); background: var(--surface); font: inherit; color: var(--label); }
.field input[aria-invalid="true"] { border: 1.5px solid var(--danger); }
.field .message { font-size: 13px; color: var(--danger); }
.select { position: relative; display: flex; }
.select select { appearance: none; width: 100%; padding-inline-end: var(--space-9); }
.select::after { content: ""; position: absolute; inset-inline-end: var(--space-5); top: 13px; width: 7px; height: 7px; border: solid var(--tint); border-width: 0 2px 2px 0; transform: rotate(45deg); pointer-events: none; }

/* Price syncs: the 90-day strip and Needs attention */
.strip-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-5); }
.strip-head h2 { font-size: 17px; font-weight: 600; margin: 0; }
.legend { display: flex; gap: var(--space-5); font-size: 13px; color: var(--labelSecondary); }
.legend span::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-inline-end: var(--space-2); }
.callout { margin: var(--space-3) 0 0; text-align: end; font-size: 13px; color: var(--danger); }
.ticks { position: relative; height: 22px; margin-top: var(--space-3); }
.tick { position: absolute; top: 0; bottom: 0; width: 3px; }
.tick-ok, .key-ok::before { background: var(--saving); }
.tick-warning, .key-warning::before { background: var(--warning); }
.tick-failed, .key-failed::before { background: var(--danger); }
.tick-skipped, .key-skipped::before { background: var(--controlOutline); }
.tick-running { background: var(--label); }
.axis { position: relative; height: 18px; margin-top: var(--space-2); font-size: 12px; color: var(--labelSecondary); }
.axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.axis span:first-child { transform: none; }
.axis span:last-child { transform: translateX(-100%); }
.attention { list-style: none; margin: 0; padding: 0 var(--space-5); }
.attention li + li { border-top: 1px solid var(--separator); }
.attention a { display: grid; grid-template-columns: 148px 1fr auto 16px; align-items: center; gap: var(--space-4); padding: var(--space-4) 0; color: var(--label); }
.attention a:hover { text-decoration: none; }
.attention strong { font-size: 17px; }
.attention a::after { content: ""; width: 7px; height: 7px; border: solid var(--labelSecondary); border-width: 2px 2px 0 0; transform: rotate(45deg); }
.counts { display: flex; gap: var(--space-7); }
.counts strong { font-size: 17px; margin-inline-end: var(--space-2); }

/* Other pages' bits, until their own tickets restyle them */
dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2) var(--space-5); margin: var(--space-5) 0 0; }
dt { color: var(--labelSecondary); }
dd { margin: 0; }
h2 { font-size: 20px; margin: var(--space-7) 0 0; }
.details, .product { margin-top: var(--space-5); padding: var(--space-5); background: var(--surface); border-radius: var(--radius-group); }
.product { display: flex; flex-wrap: wrap; gap: var(--space-7); }
.product img { object-fit: contain; }
.noimage { width: 160px; margin: 0; }
.search, .filters { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); align-items: center; margin-top: var(--space-5); }
.search input, .search select, .filters input, .filters select { font: inherit; height: 36px; padding: 0 var(--space-4); border: 1px solid var(--separator); border-radius: var(--radius-control); background: var(--surface); }
.search button, .filters button { font: inherit; font-weight: 600; height: 36px; padding: 0 var(--space-5); border: 0; border-radius: var(--radius-control); background: var(--tint); color: var(--tintOn); cursor: pointer; }
.pages { display: flex; gap: var(--space-5); margin-top: var(--space-4); }
#map { height: 420px; margin-top: var(--space-5); border-radius: var(--radius-group); }
`;
