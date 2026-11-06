// Israeli price-transparency portals: Cerberus (publishedprices.co.il, most chains), Shufersal's and Carrefour's own
// sites, and laibcatalog.co.il (Victory, Machsanei Hashuk). docs/research/price-data.md section 1. Each lists every store.
import type { ChainSeed } from "#/ingest/chains.ts";
import { parseFileName } from "#/ingest/files.ts";
import { decodeXml, looksLikePriceFile } from "#/ingest/parse.ts";
import type { PriceFile, PricePortal } from "#/services/price-portal.ts";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type Jar = Map<string, string>;

/** Keeps name=value of every Set-Cookie (attributes ignored; one host per jar). */
export function storeCookies(jar: Jar, setCookies: string[]) {
  for (const c of setCookies) {
    const kv = c.split(";")[0]!;
    const i = kv.indexOf("=");
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}
export const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function http(url: string, jar: Jar, init: RequestInit = {}, timeoutMs = 60_000) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": UA, Cookie: cookieHeader(jar), ...(init.headers as Record<string, string>) },
  });
  storeCookies(jar, res.headers.getSetCookie());
  return res;
}

/** Download links of a Shufersal listing page (signed Azure blob URLs that expire 30 min after listing, 2026-11-04). */
export function shufersalLinks(html: string): PriceFile[] {
  return [...html.matchAll(/href="(https:\/\/[^"]+\/([A-Za-z]+\d[\w.-]*)\?[^"]*)"/g)].map((m) => ({
    name: m[2]!,
    url: m[1]!.replace(/&amp;/g, "&"),
  }));
}

export const csrfToken = (html: string) => /<meta name="csrftoken" content="([^"]+)"/.exec(html)?.[1];

// url.retail.publishedprices.co.il fails TLS (cert is *.publishedprices.co.il); every account, Stop_Market too, works here.
const CERBERUS = "url.publishedprices.co.il";

async function cerberusList(user: string, jar: Jar): Promise<PriceFile[]> {
  const base = `https://${CERBERUS}`;
  const login = await http(`${base}/login`, jar);
  const token = csrfToken(await login.text());
  if (!token) throw new Error(`${CERBERUS}/login: no csrftoken (HTTP ${login.status})`);
  const body = new URLSearchParams({ r: "", username: user, password: "", csrftoken: token });
  const res = await http(`${base}/login/user`, jar, { method: "POST", body });
  if (res.status !== 302) throw new Error(`login as ${user} failed (HTTP ${res.status}, expected 302)`);
  const fileToken = csrfToken(await (await http(`${base}/file`, jar)).text()) ?? token;
  // GET answers {"aaData":[],"error":"Invalid request method..."}; POST with DataTables params returns every file.
  const dir = await http(`${base}/file/json/dir`, jar, {
    method: "POST",
    body: new URLSearchParams({ sEcho: "1", iDisplayStart: "0", iDisplayLength: "100000", cd: "/", csrftoken: fileToken }),
  });
  const json = (await dir.json()) as { aaData?: { name: string; type: string }[]; error?: string };
  if (json.error) throw new Error(`${CERBERUS}/file/json/dir: ${json.error}`);
  return (json.aaData ?? []).filter((f) => f.type === "file").map((f) => ({ name: f.name, url: `${base}/file/d/${encodeURIComponent(f.name)}` }));
}

/** Last page number the Shufersal pager links to (its "&gt;&gt;" link); 1 when there is no pager. */
export const shufersalLastPage = (html: string) =>
  Math.max(1, ...[...html.matchAll(/[?&](?:amp;)?page=(\d+)/g)].map((m) => Number(m[1])));

/** Shufersal's listing category (catID) of each file type (parseFileName's `type`). */
const SHUFERSAL_CATS = new Map([["stores", 5], ["pricefull", 2], ["price", 1], ["promofull", 4], ["promo", 3]]);

async function shufersalCategory(cat: number, jar: Jar): Promise<PriceFile[]> {
  const page = async (n: number) => {
    const res = await http(`https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=${cat}&storeId=0&page=${n}`, jar);
    if (!res.ok) throw new Error(`shufersal catID=${cat} page=${n}: HTTP ${res.status}`);
    return res.text();
  };
  // 20 rows a page. Every page takes 15-40 s however short, so fetch the rest 6 at a time.
  const pages = [await page(1)];
  for (let n = 2, last = shufersalLastPage(pages[0]!); n <= last; n += 6)
    pages.push(...(await Promise.all(Array.from({ length: Math.min(6, last - n + 1) }, (_, i) => page(n + i)))));
  return pages.flatMap(shufersalLinks);
}

async function shufersalList(jar: Jar): Promise<PriceFile[]> {
  const files: PriceFile[] = [];
  for (const cat of SHUFERSAL_CATS.values()) files.push(...(await shufersalCategory(cat, jar)));
  return files;
}

const RELIST_EVERY_MS = 10 * 60_000;

/**
 * Shufersal's links expire 30 min after listing, long before a full sync reaches its later files. On a 403 this lists
 * the file's category again (at most once per 10 min, so a file that is no longer listed fails fast) and returns its new
 * link; `fresh` keeps every new link of that category for the next downloads. The listing shows only each store's newest
 * file of a type, so an update (Price, Promo: published hourly) is often gone by then; its store's newer update, which
 * holds every change since the day's full file, stands in for it.
 */
function shufersalRelinker(jar: Jar, fresh: Map<string, string>) {
  const listedAt = new Map<number, number>();
  const newest = new Map<string, { ts: string; url: string }>(); // "type key" -> newest relisted file
  return async (name: string) => {
    const p = parseFileName(name);
    const cat = SHUFERSAL_CATS.get(p?.type ?? "");
    if (cat && Date.now() - (listedAt.get(cat) ?? 0) > RELIST_EVERY_MS) {
      listedAt.set(cat, Date.now());
      for (const f of await shufersalCategory(cat, jar)) {
        fresh.set(f.name, f.url);
        const q = parseFileName(f.name);
        const k = q && `${q.type} ${q.key}`;
        if (k && (newest.get(k)?.ts ?? "") < q.ts) newest.set(k, { ts: q.ts, url: f.url });
      }
    }
    const newer = p && newest.get(`${p.type} ${p.key}`);
    return fresh.get(name) ?? (newer && newer.ts > p.ts ? newer.url : undefined);
  };
}

// laibcatalog.co.il/<chain>/index.html is a JS page over a JSON API that lists every file of the chain in one response.
const LAIBCATALOG_API = "https://laibcatalog.co.il/webapi";

export const laibFiles = (rows: { fileName: string }[], chainId: string): PriceFile[] =>
  rows.map((r) => ({ name: r.fileName, url: `${LAIBCATALOG_API}/${chainId}/${encodeURIComponent(r.fileName)}` }));

async function laibList(chainId: string, jar: Jar): Promise<PriceFile[]> {
  const res = await http(`${LAIBCATALOG_API}/api/getfiles?edi=${chainId}`, jar);
  if (!res.ok) throw new Error(`laibcatalog getfiles?edi=${chainId}: HTTP ${res.status}`);
  return laibFiles((await res.json()) as { fileName: string }[], chainId);
}

/** Carrefour's page inlines today's folder and all its files: `const path = '20261101';` and `const files = [{name,..}];`. */
export function carrefourFiles(html: string, base: string): PriceFile[] {
  const path = /const path = '(\d+)'/.exec(html)?.[1];
  const list = /const files = (\[.*\]);/.exec(html)?.[1];
  if (!path || !list) throw new Error("carrefour: no `path` or `files` in the page");
  return (JSON.parse(list) as { name: string }[]).map((f) => ({ name: f.name, url: `${base}${path}/${encodeURIComponent(f.name)}` }));
}

async function carrefourList(base: string, jar: Jar): Promise<PriceFile[]> {
  const res = await http(base, jar);
  if (!res.ok) throw new Error(`${base}: HTTP ${res.status}`);
  return carrefourFiles(await res.text(), base);
}

/** Download links of a Hazi Hinam listing page: plain (unsigned) blob URLs ending in the file name. */
export const haziFiles = (html: string): PriceFile[] =>
  [...html.matchAll(/href="(https:\/\/[^"]+\/([A-Za-z]+\d[\w.-]*))"/g)].map((m) => ({ name: m[2]!, url: m[1]! }));

/** The YYYY-MM-DD of `ms` in Israel, the date Hazi Hinam's `d` filter takes. */
export const israelDate = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });

// Hazi Hinam's /Prices is a table filtered by type (t: 1 prices, 2 promotions, 3 stores) and day (d, empty = today), 50
// rows a page (p). Its pager links only nearby pages, so read pages until one is empty. Yesterday too: early in the day a
// store may not have published yet, and the picker keeps each store's newest file anyway.
async function haziList(base: string, jar: Jar): Promise<PriceFile[]> {
  const files: PriceFile[] = [];
  for (const d of ["", israelDate(Date.now() - 86_400_000)])
    for (const t of [3, 1, 2])
      for (let p = 1; p <= 100; p++) {
        const res = await http(`${base}?t=${t}&d=${d}&p=${p}`, jar);
        if (!res.ok) throw new Error(`hazi-hinam t=${t} d=${d} p=${p}: HTTP ${res.status}`);
        const page = haziFiles(await res.text());
        if (!page.length) break;
        files.push(...page);
      }
  return files;
}

// Carrefour and Dor Alon drop connections and cut bodies off mid-run (prod, 2026-11-06); a retry usually gets the file.
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 5_000;

export function pricePortals(): PricePortal {
  return {
    async open(chain: ChainSeed) {
      const jar: Jar = new Map();
      const src = chain.source;
      let files: PriceFile[];
      const fresh = new Map<string, string>();
      let relink: ((name: string) => Promise<string | undefined>) | undefined;
      if ("cerberus" in src) files = await cerberusList(src.cerberus, jar);
      else if (src.url.startsWith("https://prices.shufersal.co.il/")) {
        files = await shufersalList(jar);
        relink = shufersalRelinker(jar, fresh);
      }
      else if (src.url.startsWith("https://laibcatalog.co.il/")) files = await laibList(chain.ids[0]!, jar);
      else if (src.url.startsWith("https://prices.carrefour.co.il/")) files = await carrefourList(src.url, jar);
      else if (src.url.startsWith("https://shop.hazi-hinam.co.il/")) files = await haziList(src.url, jar);
      else throw new Error(`no downloader for ${chain.key} (${src.url})`);
      return {
        files,
        async download(file) {
          for (let attempt = 1; ; attempt++) {
            try {
              const url = fresh.get(file.name) ?? file.url;
              let res = await http(url, jar);
              const newUrl = res.status === 403 ? await relink?.(file.name) : undefined;
              if (newUrl && newUrl !== url) res = await http(newUrl, jar);
              // A 404: the file is gone. A 403 after a relink: the file is no longer listed, and relisting waits 10 min.
              const final = res.status === 404 || (res.status === 403 && relink !== undefined);
              if (!res.ok) throw Object.assign(new Error(`${file.name}: HTTP ${res.status}`), { final });
              const buf = new Uint8Array(await res.arrayBuffer());
              // A cut-off gzip throws in decodeXml and an error page isn't a price file; the next attempt may get the whole file.
              decodeXml(Buffer.from(buf));
              if (!looksLikePriceFile(buf)) throw new Error(`${file.name}: not a price file`);
              return buf;
            } catch (e) {
              if (attempt === DOWNLOAD_ATTEMPTS || (e as { final?: boolean }).final) throw e;
              await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
            }
          }
        },
      };
    },
  };
}
