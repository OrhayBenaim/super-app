import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export const notice = (text: string) => html`<p class="notice">${text}</p>`;

const NAV = {
  syncs: ["/", "Price syncs"],
  chains: ["/chains", "Chains"],
  stores: ["/stores", "Stores"],
  products: ["/products", "Products"],
  groups: ["/groups", "Product groups"],
  promotions: ["/promotions", "Promotions"],
} as const;
export type Nav = keyof typeof NAV;

/**
 * Every dashboard page: the top bar (`nav` marks the current item), the tokens stylesheet and htmx, all served by app.ts,
 * so the page loads no third-party script. The find field opens Products: the stores whose name holds it, then the Products by name or barcode.
 */
export const layout = (title: string, body: Html, nav?: Nav) => html`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title} · Grocer dashboard</title>
      <link rel="stylesheet" href="/assets/dashboard.css" />
      <script src="/assets/htmx.min.js" defer></script>
    </head>
    <body>
      <header class="topbar">
        <a class="brand" href="/">Grocer<span>Internal</span></a>
        <nav aria-label="Dashboard">
          ${Object.entries(NAV).map(([key, [href, text]]) => html`<a href="${href}"${key === nav ? html` aria-current="page"` : ""}>${text}</a>`)}
        </nav>
        <form class="find" method="get" action="/products" role="search">
          <input type="search" name="q" aria-label="Find" placeholder="Find a store, Product or barcode" />
        </form>
      </header>
      <main>${body}</main>
    </body>
  </html>`;

/** The page for a store, Product or Promotion that does not exist (or an id that names none). */
export const notFound = (text: string) => layout("Not found", html`<p class="notice busy">${text}</p>`);
