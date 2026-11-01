// npm run fetch -- --chain <key> [--out dir] [--stores-only] [--max-stores N]
// Downloads the newest Stores file and the newest PriceFull per store (docs/research/price-data.md section 1).
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { chainSeeds, type ChainSeed } from "./chains.js";

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

export type FileRef = { name: string; url: string };
export type ParsedName = { type: string; key: string; ts: string };

/** "PriceFull7290058140886-001-039-20261101-001003.gz" and "pricefull7290058140886-039-202611010514.gz" -> type, store key, timestamp. */
export function parseFileName(name: string): ParsedName | null {
  const m = /^([a-z]+)(\d[\d-]*?)-(\d{8})-?(\d{3,6})(?:\.|$)/i.exec(name);
  return m ? { type: m[1]!.toLowerCase(), key: m[2]!, ts: m[3]! + m[4]!.padEnd(6, "0") } : null;
}

/**
 * Newest Stores file plus the newest PriceFull of the first `maxStores` stores (by file key), only for `chainIds`
 * (Keshet's account also lists a 2024 Carrefour file).
 */
export function pickFiles(files: FileRef[], maxStores: number, chainIds: string[]) {
  const newest = new Map<string, FileRef & ParsedName>();
  for (const f of files) {
    const p = parseFileName(f.name);
    if (!p || (p.type !== "stores" && p.type !== "pricefull") || !chainIds.some((id) => p.key.startsWith(id))) continue;
    const k = p.type === "stores" ? "stores" : p.key;
    if ((newest.get(k)?.ts ?? "") < p.ts) newest.set(k, { ...f, ...p });
  }
  const stores = newest.get("stores");
  newest.delete("stores");
  const prices = [...newest.keys()].sort().slice(0, maxStores).map((k) => newest.get(k)!);
  return { stores, prices };
}

/** Download links of a Shufersal listing page (signed Azure blob URLs, ~1 h expiry). */
export function shufersalLinks(html: string): FileRef[] {
  return [...html.matchAll(/href="(https:\/\/[^"]+\/([A-Za-z]+\d[\w.-]*)\?[^"]*)"/g)].map((m) => ({
    name: m[2]!,
    url: m[1]!.replace(/&amp;/g, "&"),
  }));
}

export const csrfToken = (html: string) => /<meta name="csrftoken" content="([^"]+)"/.exec(html)?.[1];

// url.retail.publishedprices.co.il fails TLS (cert is *.publishedprices.co.il); every account, Stop_Market too, works here.
const CERBERUS = "url.publishedprices.co.il";

async function cerberusList(user: string, jar: Jar): Promise<FileRef[]> {
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

async function shufersalList(jar: Jar): Promise<FileRef[]> {
  const page = async (cat: number) => {
    const res = await http(`https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=${cat}&storeId=0`, jar);
    if (!res.ok) throw new Error(`shufersal catID=${cat}: HTTP ${res.status}`);
    return shufersalLinks(await res.text());
  };
  return [...(await page(5)), ...(await page(2))]; // 5 Stores, 2 PriceFull (page 1 = first 20 stores)
}

/** Rejects HTML login pages and redirect stubs: a price file is gzip, zip, or XML (optionally with a BOM). */
export function looksLikePriceFile(buf: Uint8Array) {
  const head = Buffer.from(buf.subarray(0, 64)).toString("latin1").replace(/^\xEF\xBB\xBF|^\xFF\xFE|^\xFE\xFF/, "").replace(/\0/g, "");
  return (buf[0] === 0x1f && buf[1] === 0x8b) || (buf[0] === 0x50 && buf[1] === 0x4b) || /^\s*<(\?xml|(?!html[\s>])[a-z][\w:.-]*[\s>])/i.test(head);
}

export async function fetchChain(chain: ChainSeed, outDir: string, opts: { storesOnly?: boolean; maxStores?: number } = {}) {
  const jar: Jar = new Map();
  const src = chain.source;
  let files: FileRef[];
  if ("cerberus" in src) files = await cerberusList(src.cerberus, jar);
  else if (chain.key === "shufersal") files = await shufersalList(jar);
  else {
    // shortcut: listing formats of the other portals are not implemented; they were unreachable from here on 2026-11-01.
    const res = await http(src.url, jar, {}, 20_000);
    throw new Error(`no downloader for ${chain.key} yet (portal answered HTTP ${res.status})`);
  }
  const { stores, prices } = pickFiles(files, opts.storesOnly ? 0 : (opts.maxStores ?? 3), chain.ids);
  if (!stores) throw new Error(`${chain.key}: no Stores file among ${files.length} listed files`);
  mkdirSync(outDir, { recursive: true });
  const saved: string[] = [];
  for (const f of [stores, ...prices]) {
    const res = await http(f.url, jar);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!res.ok || !looksLikePriceFile(buf)) throw new Error(`${f.name}: HTTP ${res.status}, not a price file`);
    const path = join(outDir, f.name.replace(/[^\w.-]/g, "_"));
    writeFileSync(path, buf);
    saved.push(path);
    console.log(`${path} ${buf.length} bytes`);
  }
  return saved;
}

async function main() {
  const { values } = parseArgs({
    options: { chain: { type: "string" }, out: { type: "string" }, "stores-only": { type: "boolean" }, "max-stores": { type: "string" } },
  });
  const chain = chainSeeds.find((c) => c.key === values.chain);
  if (!chain) {
    console.error(`usage: npm run fetch -- --chain <${chainSeeds.map((c) => c.key).join("|")}> [--out dir] [--stores-only] [--max-stores N]`);
    process.exit(1);
  }
  const out = values.out ?? join(tmpdir(), "grocer-prices", chain.key);
  const maxStores = Number(values["max-stores"] ?? 3);
  if (!Number.isInteger(maxStores) || maxStores < 1) {
    console.error(`--max-stores must be a whole number >= 1, got "${values["max-stores"]}"`);
    process.exit(1);
  }
  await fetchChain(chain, out, { storesOnly: values["stores-only"], maxStores });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
