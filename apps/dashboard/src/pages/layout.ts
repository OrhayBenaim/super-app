import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

/** Every dashboard page: the shell, its styles and htmx (served by app.ts, so the page loads no third-party script). */
export const layout = (title: string, body: Html) => html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title} · Grocer dashboard</title>
      <script src="/assets/htmx.min.js" defer></script>
      <style>
        body { margin: 0; font: 15px/1.45 system-ui, sans-serif; color: #1c1c1e; background: #f6f6f4; }
        main { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
        header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
        h1 { font-size: 22px; margin: 0; }
        button { font: inherit; padding: 8px 14px; border: 0; border-radius: 8px; background: #1f6f43; color: #fff; cursor: pointer; }
        button:focus-visible { outline: 3px solid #f2b705; outline-offset: 2px; }
        .notice { margin: 16px 0 0; padding: 10px 14px; border-radius: 8px; background: #fff; border-inline-start: 4px solid #1f6f43; }
        .notice.busy { border-color: #b45309; }
        .scroll { overflow-x: auto; margin-top: 16px; background: #fff; border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; text-align: start; border-bottom: 1px solid #e7e7e3; white-space: nowrap; }
        th { font-size: 13px; color: #5c5c58; font-weight: 600; }
        tbody tr:last-child td { border-bottom: 0; }
        .muted { color: #6b6b64; }
        .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 13px; font-weight: 600; border: 1px solid; }
        .badge-finished { background: #e3f4e8; color: #1d5e36; border-color: #a9d8b8; }
        .badge-running { background: #e6efff; color: #1d4ed8; border-color: #a9c1f5; }
        .badge-requested { background: #fff; color: #1d4ed8; border-style: dashed; }
        .badge-interrupted { background: #fde8e8; color: #9b1c1c; border-color: #f3b0b0; }
        .badge-skipped { background: #f1f0ec; color: #57534e; border-color: #d6d3cd; }
        .badge-ok { background: #e3f4e8; color: #1d5e36; border-color: #a9d8b8; }
        .badge-failed { background: #fde8e8; color: #9b1c1c; border-color: #f3b0b0; }
        nav { display: flex; gap: 16px; margin-bottom: 16px; }
        a { color: #1f6f43; }
        tr.errors td { white-space: normal; padding-top: 0; color: #9b1c1c; font-size: 14px; }
        dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 16px 0 0; }
        dt { color: #5c5c58; }
        h2 { font-size: 18px; margin: 24px 0 0; }
        .search { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 16px; }
        .search input, .search select { font: inherit; padding: 7px 10px; border: 1px solid #c9c9c3; border-radius: 8px; min-width: 240px; }
        .pages { display: flex; gap: 16px; margin-top: 12px; }
        .product { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 16px; padding: 16px; background: #fff; border-radius: 10px; }
        .product img { object-fit: contain; }
        .noimage { width: 160px; margin: 0; }
        .product dl { grid-template-columns: auto 1fr; margin: 0; }
        .product dt { font-weight: 600; }
        dd { margin: 0; }
        .filters { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; margin-top: 16px; }
        select { font: inherit; padding: 6px 8px; border-radius: 8px; border: 1px solid #c9c9c3; background: #fff; }
        #map { height: 420px; margin-top: 16px; border-radius: 10px; }
        .details { margin-top: 16px; padding: 16px; background: #fff; border-radius: 10px; }
        .details dt { font-weight: 600; }
        .badge-ignored { background: #fff; color: #6b6b64; border-color: #d6d3cd; border-style: dotted; }
      </style>
    </head>
    <body>
      <main>
        <nav aria-label="Dashboard"><a href="/">Price syncs</a><a href="/chains">Chains</a><a href="/stores">Stores</a><a href="/products">Products</a><a href="/groups">Product groups</a></nav>
        ${body}
      </main>
    </body>
  </html>`;
