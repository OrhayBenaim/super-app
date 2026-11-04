import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestPromotions, ingestStores, readXml } from "#/ingest/ingest.ts";
import { isGtin } from "#/ingest/parse.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const here = { lat: 32.0853, lng: 34.7818 };
const NOW = new Date("2026-11-05T10:00:00+02:00"); // a Thursday; the real files (downloaded 2026-11-04) run through late November

const chains = {
  keshet: { key: "keshet", id: "7290785400000" },
  rami: { key: "rami-levy", id: "7290058140886" },
  shufersal: { key: "shufersal", id: "7290027600007" },
  carrefour: { key: "carrefour", id: "7290055700007" },
  osher: { key: "osher-ad", id: "7290103152017" },
  hazi: { key: "hazi-hinam", id: "7290700100008" },
  stop: { key: "stop-market", id: "7290639000004" },
  dorAlon: { key: "dor-alon", id: "7290492000005" },
  machsanei: { key: "machsanei-hashuk", id: "7290661400001" },
  fresh: { key: "fresh-market", id: "7290876100000" },
  salach: { key: "salach-dabach", id: "7290526500006" },
} as const;
type Chain = (typeof chains)[keyof typeof chains];

type Line = {
  code: string;
  price: number;
  quantity: number;
  lineTotal: number;
  promotion?: { id: string; kind: string; minQty: number; amount: number; audience: string; text: string };
  info?: { id: string; description: string }[];
};

const file = (dir: string, name: string) => readXml(fileURLToPath(new URL(`../__fixtures__/real/promos/${dir}/${name}`, import.meta.url)));
/** The store a real file name names: "...-001-001-20261104-..." and "...-002-202611040010" -> the segment before the stamp. */
const storeOf = (name: string) => /-(\d+)-\d{8}/.exec(name)![1]!;
const storesXml = (chain: string, store: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>${store}</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
/** Products that are not GTINs are scoped to their Chain. */
const productCode = (chain: Chain, code: string) => (isGtin(code) ? code : `${chain.id}:${code}`);

/** One store of `chain` loaded from the real files in `promos/<dir>/`: the PriceFull, then the PromoFull, then the Promo update if any. */
async function real(chain: Chain, dir: string, files: { price: string; promos: string[] }) {
  const deps = buildDeps(loadConfig(), { clock: fakeClock(NOW) });
  const app = createApp(deps);
  ingestStores(deps, chain.key, storesXml(chain.id, storeOf(files.price)));
  ingestPrices(deps, chain.key, file(dir, files.price), files.price);
  for (const promos of files.promos) ingestPromotions(deps, chain.key, file(dir, promos), promos);
  deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, chain.id);
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "layouts@prices.test", password: "password1234", name: "Layouts" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const compare = async (items: [code: string, quantity: number][]) => {
    const res = await app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ...here, items: items.map(([code, quantity]) => ({ code: productCode(chain, code), quantity })) }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: { total: number; items: Line[] }[] }).stores[0]!;
  };
  /** The one store's line for `code` at `quantity`. */
  const line = async (code: string, quantity = 1) => (await compare([[code, quantity]])).items[0]!;
  return { app, line, compare };
}

const KESHET2 = {
  price: "PriceFull7290785400000-002-202611040010.gz",
  promos: ["PromoFull7290785400000-002-202611040011.gz", "Promo7290785400000-002-202611041400.gz"],
};
const keshet2 = () => real(chains.keshet, "keshet", KESHET2);

describe("Compare with the flat layout (Keshet store 2, real files)", () => {
  it("RewardType 1, MinQty 3: 3 for 15.90", async () => {
    const w = await keshet2();
    expect(await w.line("4770166219535", 3)).toMatchObject({ price: 6.9, lineTotal: 15.9, promotion: { id: "17659", kind: "bundle", minQty: 3, amount: 15.9, audience: "all" } });
  });

  it("RewardType 2: DiscountRate 2000 is 20% off", async () => {
    const w = await keshet2();
    expect(await w.line("3574661003924")).toMatchObject({ price: 21.9, lineTotal: 17.52, promotion: { id: "1156135", audience: "all" } });
  });

  it("weighted RewardType 1, MinQty 0.01: the price is per kilo from any weight", async () => {
    const w = await keshet2();
    expect(await w.line("7290000017007", 2)).toMatchObject({ price: 18.9, lineTotal: 29.8, promotion: { id: "169867", kind: "price", amount: 14.9 } });
  });

  it("weighted MinQty 2: 2 kilos for MinQty x price, the rest at the Shelf price", async () => {
    const w = await keshet2();
    expect((await w.line("17002", 2)).lineTotal).toBeCloseTo(69.9, 2);
    const three = await w.line("17002", 3);
    expect(three.lineTotal).toBeCloseTo(109.8, 2); // 69.90 + 1 kg at 39.90
    expect(three.promotion).toMatchObject({ id: "174370" });
    expect((await w.line("17002", 1)).lineTotal).toBe(39.9); // under one set: Shelf price
  });

  it("weighted MinQty 3: 3 kilos for 3 x 14.96", async () => {
    const w = await keshet2();
    const l = await w.line("17001", 3);
    expect(l.lineTotal).toBeCloseTo(44.88, 2);
    expect(l.promotion).toMatchObject({ id: "1156875" });
  });

  it("RewardType 9 at rate 10000 is 3+1: the cheapest of every 4 is free", async () => {
    const w = await keshet2();
    expect(await w.line("7290000208947", 4)).toMatchObject({ price: 6.5, lineTotal: 19.5, promotion: { id: "1154524", kind: "nth", minQty: 4 } });
    expect((await w.line("7290000208947", 3)).lineTotal).toBe(19.5); // 3 x 6.50: not yet a set
  });

  it("a bare ClubId 1 Promotion is excluded: not stored, not shown at all", async () => {
    const w = await keshet2();
    const l = await w.line("4840022004152", 2);
    expect(l.lineTotal).toBe(19.8);
    expect(l).not.toHaveProperty("promotion");
    expect(l).not.toHaveProperty("info");
  });

  it("MaxQty is the limit per purchase: units above it stay at the Shelf price", async () => {
    const w = await keshet2();
    expect(await w.line("7290112771896", 5)).toMatchObject({ lineTotal: 99.5, promotion: { id: "1149895" } });
    expect((await w.line("7290112771896", 7)).lineTotal).toBeCloseTo(179.3, 2); // 5 x 19.90 + 2 x 39.90
  });

  it("is a 401 without a cookie", async () => {
    const w = await keshet2();
    const res = await w.app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...here, items: [{ code: "4770166219535", quantity: 1 }] }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Compare with the flat-percent layout (Rami Levy store 039, real zip files named .gz)", () => {
  const FILES = {
    price: "pricefull7290058140886-039-202611040520.gz",
    promos: ["promofull7290058140886-039-202611040521.gz", "promo7290058140886-039-202611041302.gz"],
  };
  const rami39 = () => real(chains.rami, "rami-levy", FILES);

  it("RewardType 1, MinQty 3: 3 for 10.90 (whole-percent layout)", async () => {
    const w = await rami39();
    expect(await w.line("7290113470859", 3)).toMatchObject({ price: 5.1, lineTotal: 10.9, promotion: { id: "910371056", kind: "bundle", minQty: 3, amount: 10.9 } });
  });

  it("a 2-for-15.90 at 7.80 does not save, so the line stays at the Shelf price", async () => {
    const w = await rami39();
    const l = await w.line("4009900412087", 2);
    expect(l.lineTotal).toBe(15.6);
    expect(l).not.toHaveProperty("promotion");
  });

  it("the Promo update's 430214 (2 for 25 at 10.80, no saving) leaves the line at the Shelf price", async () => {
    const w = await rami39();
    expect((await w.line("7290109923024", 2)).lineTotal).toBe(21.6);
  });

  it("ClubId 2 inside AdditionalRestrictions is audience card", async () => {
    const w = await rami39();
    expect(await w.line("7290000000091")).toMatchObject({ price: 35.9, lineTotal: 29.9, promotion: { id: "910368957", audience: "card" } });
  });

  it("free delivery (RewardType 2 at rate 100) is information only", async () => {
    const w = await rami39();
    const l = await w.line("7290119371822");
    expect(l.lineTotal).toBe(4.5);
    expect(l).not.toHaveProperty("promotion");
    expect(l.info).toContainEqual(expect.objectContaining({ id: "910371135", description: "קנה ממוצרי ויגן ב-49.90 קבל משלוח חינם" }));
  });

  it('"2+1 מתנה" (RewardType 9 at rate 0) is information only', async () => {
    const w = await rami39();
    const l = await w.line("7290118071594", 3);
    expect(l.lineTotal).toBeCloseTo(23.7, 2);
    expect(l).not.toHaveProperty("promotion");
    expect(l.info).toContainEqual(expect.objectContaining({ id: "910369814", description: "מגוון מוצרי חזרה לבית הספר 2+1 מתנה !" }));
  });
});

describe("Compare with the grouped layout from real Shufersal and Carrefour files", () => {
  const shufersal = () =>
    real(chains.shufersal, "shufersal", {
      price: "PriceFull7290027600007-001-001-20261104-030000.gz",
      promos: ["PromoFull7290027600007-001-001-20261104-030000.gz", "Promo7290027600007-001-001-20261104-140000.gz"],
    });
  const carrefour = () =>
    real(chains.carrefour, "carrefour", {
      price: "PriceFull7290055700007-001-002-20261104-051000.gz",
      promos: ["PromoFull7290055700007-001-002-20261104-051126.gz", "Promo7290055700007-001-002-20261104-140034.gz"],
    });

  it("Shufersal: a fixed price (11.90 on 16.90)", async () => {
    const w = await shufersal();
    expect(await w.line("7296073722168")).toMatchObject({ price: 16.9, lineTotal: 11.9, promotion: { id: "4668648", kind: "price", amount: 11.9 } });
  });

  it("Shufersal: a per-kilo price (19.90 on 25.90 a kilo)", async () => {
    const w = await shufersal();
    expect(await w.line("7290000995021", 2)).toMatchObject({ price: 25.9, lineTotal: 39.8, promotion: { id: "4673822" } });
  });

  it("Shufersal: a Promo update's per-kilo price", async () => {
    const w = await shufersal();
    expect(await w.line("7290000964461", 2)).toMatchObject({ price: 8.9, lineTotal: 11.8, promotion: { id: "4687598" } });
  });

  it("Shufersal: mix and match across two codes (2 for 34)", async () => {
    const w = await shufersal();
    const store = await w.compare([["7290000346120", 1], ["7290000346137", 1]]);
    expect(store.total).toBe(34);
  });

  it("Carrefour: a fixed price (9.90 on 12.90)", async () => {
    const w = await carrefour();
    expect(await w.line("3560071431884")).toMatchObject({ price: 12.9, lineTotal: 9.9, promotion: { id: "11455361", kind: "price", amount: 9.9 } });
  });

  it("Carrefour: 6 for 21", async () => {
    const w = await carrefour();
    expect(await w.line("7290000066134", 6)).toMatchObject({ price: 5.5, lineTotal: 21, promotion: { id: "11458978", kind: "bundle", minQty: 6, amount: 21 } });
  });
});

describe("Compare with the other Chains' real files", () => {
  // [chain, dir, PriceFull, PromoFull, code, quantity, lineTotal, PromotionID]
  it.each<[keyof typeof chains, string, string, string, string, number, number, string]>([
    ["osher", "osher-ad", "PriceFull7290103152017-001-001-20261104-140502.gz", "PromoFull7290103152017-001-001-20261104-140530.gz", "7290017918730", 2, 18, "175593"],
    ["hazi", "hazi-hinam", "PriceFull7290700100008-000-103-20261104-135207.gz", "PromoFull7290700100008-000-103-20261104-135300.gz", "811250035250", 2, 16, "209221"],
    ["stop", "stop-market", "PriceFull7290639000004-001-002-20261104-010002.gz", "PromoFull7290639000004-001-002-20261104-010832.gz", "8710908326691", 1, 17.9, "1145905"],
    ["dorAlon", "dor-alon", "PriceFull7290492000005-001-401-20261104-000505.gz", "PromoFull7290492000005-001-401-20261104-000550.gz", "5705833080407", 1, 62.93, "13408020"],
    ["machsanei", "machsanei-hashuk", "PriceFull7290661400001-001-001-20261104-042044.gz", "PromoFull7290661400001-001-001-20261104-042101.gz", "7290017841687", 3, 14, "10003552"],
    ["fresh", "fresh-market", "PriceFull7290876100000-001-001-20261104-001006.gz", "PromoFull7290876100000-001-001-20261104-001235.gz", "7290109842745", 3, 15, "1240136"],
    ["salach", "salach-dabach", "PriceFull7290526500006-001-004-20261104-002017.gz", "PromoFull7290526500006-001-004-20261104-002112.gz", "7290001709467", 2, 30, "1345213"],
    ["rami", "rami-levy", "PriceFull7290058140886-001-001-20261104-121500.gz", "PromoFull7290058140886-001-001-20261104-121558.gz", "7290019428220", 4, 10, "1397856"],
  ])("%s: one known Promotion sets the line total", async (chain, dir, price, promo, code, quantity, lineTotal, id) => {
    const w = await real(chains[chain], dir, { price, promos: [promo] });
    const l = await w.line(code, quantity);
    expect(l.lineTotal).toBeCloseTo(lineTotal, 2);
    expect(l.promotion).toMatchObject({ id });
  });
});
