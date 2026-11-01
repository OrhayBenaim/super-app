// Israeli price-transparency portals: Cerberus (publishedprices.co.il, most chains), Shufersal's and Carrefour's own
// sites, and laibcatalog.co.il (Victory, Machsanei Hashuk). docs/research/price-data.md section 1. Each lists every store.
import type { ChainSeed } from "#/ingest/chains.ts";
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

/** Download links of a Shufersal listing page (signed Azure blob URLs, ~1 h expiry). */
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

async function shufersalList(jar: Jar): Promise<PriceFile[]> {
  const page = async (cat: number, n: number) => {
    const res = await http(`https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=${cat}&storeId=0&page=${n}`, jar);
    if (!res.ok) throw new Error(`shufersal catID=${cat} page=${n}: HTTP ${res.status}`);
    return res.text();
  };
  const files: PriceFile[] = [];
  for (const cat of [5, 2]) {
    // 5 Stores, 2 PriceFull (20 rows a page). Every page takes 15-20 s however short, so fetch the rest 6 at a time.
    const pages = [await page(cat, 1)];
    for (let n = 2, last = shufersalLastPage(pages[0]!); n <= last; n += 6)
      pages.push(...(await Promise.all(Array.from({ length: Math.min(6, last - n + 1) }, (_, i) => page(cat, n + i)))));
    files.push(...pages.flatMap(shufersalLinks));
  }
  return files;
}

// laibcatalog.co.il/<chain>/index.html is a JS page over a JSON API that lists every file of the chain in one response.
const LAIB = "https://laibcatalog.co.il/webapi";

export const laibFiles = (rows: { fileName: string }[], chainId: string): PriceFile[] =>
  rows.map((r) => ({ name: r.fileName, url: `${LAIB}/${chainId}/${encodeURIComponent(r.fileName)}` }));

async function laibList(chainId: string, jar: Jar): Promise<PriceFile[]> {
  const res = await http(`${LAIB}/api/getfiles?edi=${chainId}`, jar);
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

export function pricePortals(): PricePortal {
  return {
    async open(chain: ChainSeed) {
      const jar: Jar = new Map();
      const src = chain.source;
      let files: PriceFile[];
      if ("cerberus" in src) files = await cerberusList(src.cerberus, jar);
      else if (src.url.startsWith("https://prices.shufersal.co.il/")) files = await shufersalList(jar);
      else if (src.url.startsWith("https://laibcatalog.co.il/")) files = await laibList(chain.ids[0]!, jar);
      else if (src.url.startsWith("https://prices.carrefour.co.il/")) files = await carrefourList(src.url, jar);
      else {
        // shortcut: Hazi Hinam's listing is not implemented (403 from a US IP, untested from Israel); add it once seen live.
        const res = await http(src.url, jar, {}, 20_000);
        throw new Error(`no downloader for ${chain.key} yet (portal answered HTTP ${res.status})`);
      }
      return {
        files,
        async download(file) {
          const res = await http(file.url, jar);
          if (!res.ok) throw new Error(`${file.name}: HTTP ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        },
      };
    },
  };
}
