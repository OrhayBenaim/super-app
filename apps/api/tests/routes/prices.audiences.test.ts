import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestPromotions, ingestStores, readXml } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const here = { lat: 32.0853, lng: 34.7818 };
const NOW = new Date("2026-11-04T15:00:00+02:00");
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const [A, B] = ["7290001000001", "7290001000002"].map(gtin);

const chains = {
  osher: { key: "osher-ad", id: "7290103152017" },
  victory: { key: "victory", id: "7290696200003" },
  machsanei: { key: "machsanei-hashuk", id: "7290661400001" },
  rami: { key: "rami-levy", id: "7290058140886" },
  keshet: { key: "keshet", id: "7290785400000" },
  dorAlon: { key: "dor-alon", id: "7290492000005" },
  carrefour: { key: "carrefour", id: "7290055700007" },
  shufersal: { key: "shufersal", id: "7290027600007" },
  tivTaam: { key: "tiv-taam", id: "7290873255550" },
} as const;
type Chain = (typeof chains)[keyof typeof chains];

// --- builders (copied from prices.promotions.test.ts) -----------------------------------------------------------------
const storesXml = (chain: string, sub = "1", store = "1") =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>${sub}</SubChainID><Stores><Store><StoreID>${store}</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: [code: string, price: number][]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, price]) => `<Item><ItemCode>${code}</ItemCode><ItemName>מוצר ${code}</ItemName><ManufacturerName></ManufacturerName><UnitQty>יחידות</UnitQty><Quantity>1</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

type Promo = { id: string; item: string; price: number; club?: string; coupon?: 0 | 1 };
const escapeXml = (s: string) => s.replace(/&/g, "&amp;");
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>מבצע ${p.id}</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2026-11-30T23:59:00.000</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays></PromotionDays><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>${escapeXml(p.club ?? "0 - כלל הלקוחות")}</ClubID><IsGiftItem /><AdditionalIsCoupon>${p.coupon ?? 0}</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems><PromotionItem><ItemCode>${p.item}</ItemCode><ItemType>1</ItemType><RewardType>3</RewardType><MinQty>1.00</MinQty><MaxQty></MaxQty><DiscountRate></DiscountRate><DiscountedPrice>${p.price.toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${p.price.toFixed(2)}</DiscountedPricePerMida><bIsWeighted>0</bIsWeighted></PromotionItem></PromotionItems></Group></Groups></Promotion>`;
const promosXml = (chain: string, promos: Promo[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`;
const fullName = (chain: string) => `PromoFull${chain}-001-001-20261104-010000.xml`;
const updateName = (chain: string) => `Promo${chain}-001-001-20261104-120000.xml`;

type Line = {
  code: string;
  price: number;
  quantity: number;
  lineTotal: number;
  promotion?: { id: string; kind: string; minQty: number; amount: number; audience: string; text: string };
};

async function world(setups: { chain: Chain; items?: [string, number][]; promos?: Promo[] }[] = []) {
  const deps = buildDeps(loadConfig(), { clock: fakeClock(NOW) });
  const app = createApp(deps);
  const setPos = deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?");
  setups.forEach(({ chain, items = [], promos = [] }) => {
    ingestStores(deps, chain.key, storesXml(chain.id));
    ingestPrices(deps, chain.key, pricesXml(chain.id, items), `PriceFull${chain.id}-001-001-20261104-000000.xml`);
    ingestPromotions(deps, chain.key, promosXml(chain.id, promos), fullName(chain.id));
    setPos.run(here.lat, here.lng, chain.id);
  });
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "audience@prices.test", password: "password1234", name: "Audience" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  /** The one store's line for `code` at `quantity`. */
  const line = async (code: string, quantity = 1): Promise<Line> => {
    const res = await app.request("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ...here, items: [{ code, quantity }] }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: { items: Line[] }[] }).stores[0]!.items[0]!;
  };
  return { deps, line };
}

/** One chain, item A at 6.9 on the shelf, one Promotion at 4.9 with this ClubID / coupon flag. */
const single = (chain: Chain, club: string, coupon: 0 | 1 = 0) =>
  world([{ chain, items: [[A, 6.9]], promos: [{ id: "201", item: A, price: 4.9, club, coupon }] }]);

const expectExcluded = (l: Line, shelf: number) => {
  expect(l.lineTotal).toBe(shelf);
  expect(l).not.toHaveProperty("promotion");
};

describe("Compare with Restricted promotions", () => {
  it("baseline: an all-customer Promotion counts as audience all", async () => {
    const w = await single(chains.osher, "0 - כלל הלקוחות");
    expect(await w.line(A)).toMatchObject({ lineTotal: 4.9, promotion: { id: "201", audience: "all" } });
  });

  // [ClubID, chain, AdditionalIsCoupon, audience]
  it.each<[string, keyof typeof chains, 0 | 1, string]>([
    ["0", "osher", 1, "coupon"],
    ["0 - כלל הלקוחות", "osher", 1, "coupon"],
    ["1 - המועדון החדש", "tivTaam", 0, "club"],
    ["1=מועדון אונליין AM:PM", "dorAlon", 0, "club"],
    ["(2=מועדון קרפור אשראי|2=מועדון אפליקציה)", "carrefour", 0, "club"],
    ["2 - מועדון אשראי של הקמעונאי", "shufersal", 0, "card"],
    ["((2=מועדון לקוחות אשראי))&(3=תווי זיכוי מימוש|3=עיגול אגורות)", "rami", 0, "card"],
    ["1=מועדון אונליין AM:PM", "dorAlon", 1, "coupon"],
    ["2 - מועדון אשראי של הקמעונאי", "shufersal", 1, "coupon"],
    ["2", "victory", 0, "card"],
    ["2", "machsanei", 0, "card"],
    ["2", "rami", 0, "card"],
  ])("ClubID %j at %s (coupon %i) is audience %s and lowers the total", async (club, chain, coupon, audience) => {
    const w = await single(chains[chain], club, coupon);
    expect(await w.line(A)).toMatchObject({ price: 6.9, lineTotal: 4.9, promotion: { id: "201", audience } });
  });

  // [ClubID, chain, AdditionalIsCoupon]
  it.each<[string, keyof typeof chains, 0 | 1]>([
    ["1=עובדים", "osher", 0],
    ["1=עובדים", "osher", 1],
    ["(3=עובדי קבוצה)", "osher", 0],
    ["1=עובדי פרשמרקט", "osher", 0],
    ["1 - מועדון עובדים", "osher", 0],
    ["(3=זהב)", "osher", 0],
    ["(3=פלטינום)", "osher", 1],
    ["1=V.I.P לקוחות", "osher", 0],
    ["1=", "keshet", 0],
    ["1=", "keshet", 1],
    ["1", "victory", 0],
    ["1", "machsanei", 0],
    ["1", "osher", 0],
    ["1", "keshet", 0],
    ["2", "osher", 0],
  ])("ClubID %j at %s (coupon %i) is excluded: the line stays at the Shelf price", async (club, chain, coupon) => {
    const w = await single(chains[chain], club, coupon);
    expectExcluded(await w.line(A), 6.9);
  });

  describe("an all-customer and a Restricted promotion compete for one item", () => {
    const compete = (all: number, club: number) =>
      world([
        {
          chain: chains.osher,
          items: [[A, 10]],
          promos: [
            { id: "301", item: A, price: all },
            { id: "302", item: A, price: club, club: "1 - המועדון החדש" },
          ],
        },
      ]);

    it("the club one wins when it is cheaper", async () => {
      const w = await compete(5, 4);
      expect(await w.line(A)).toMatchObject({ lineTotal: 4, promotion: { id: "302", audience: "club" } });
    });

    it("the all-customer one wins when it is cheaper", async () => {
      const w = await compete(4, 5);
      expect(await w.line(A)).toMatchObject({ lineTotal: 4, promotion: { id: "301", audience: "all" } });
    });
  });

  it("a Promo update file moving a Promotion to an excluded audience takes it out of Compare", async () => {
    const chain = chains.osher;
    const w = await world([{ chain, items: [[A, 6.9], [B, 6.9]], promos: [
      { id: "401", item: A, price: 4.9, club: "1 - המועדון החדש" },
      { id: "402", item: B, price: 5.9, club: "1 - המועדון החדש" },
    ] }]);
    expect(await w.line(A)).toMatchObject({ lineTotal: 4.9, promotion: { id: "401", audience: "club" } });
    ingestPromotions(w.deps, chain.key, promosXml(chain.id, [{ id: "401", item: A, price: 4.9, club: "1=עובדים" }]), updateName(chain.id));
    expectExcluded(await w.line(A), 6.9);
    expect(await w.line(B)).toMatchObject({ lineTotal: 5.9, promotion: { id: "402" } });
  });
});

describe("Compare with Restricted promotions from real files (downloaded 2026-11-04)", () => {
  const dir = (chain: string, file: string) => readXml(fileURLToPath(new URL(`../__fixtures__/real/promos/${chain}/${file}`, import.meta.url)));

  async function real(chain: Chain, dirName: string, sub: string, store: string, stamp: [price: string, promo: string]) {
    const w = await world();
    const prefix = (type: string, s: string) => `${type}${chain.id}-${sub}-${store}-20261104-${s}.gz`;
    ingestStores(w.deps, chain.key, storesXml(chain.id, sub, store));
    ingestPrices(w.deps, chain.key, dir(dirName, prefix("PriceFull", stamp[0])), prefix("PriceFull", stamp[0]));
    ingestPromotions(w.deps, chain.key, dir(dirName, prefix("PromoFull", stamp[1])), prefix("PromoFull", stamp[1]));
    w.deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?").run(here.lat, here.lng, chain.id);
    return w;
  }
  const victory = () => real(chains.victory, "victory", "001", "001", ["095809", "095820"]);

  it("Victory: a Max Victory credit card Promotion (ClubID 2) is audience card", async () => {
    const w = await victory();
    expect(await w.line("4810168000998")).toMatchObject({ price: 22.9, lineTotal: 16.9, promotion: { id: "264944", audience: "card" } });
  });

  it("Victory: a Wolt-only Promotion (ClubID 1) never reaches Compare", async () => {
    const w = await victory();
    expectExcluded(await w.line("7290014321984"), 11.9);
  });

  it("Keshet: a Promotion with an empty club name (ClubID 1=) never reaches Compare", async () => {
    const w = await real(chains.keshet, "keshet", "001", "014", ["001015", "001224"]);
    expectExcluded(await w.line("4607051158238"), 12.9);
  });

  it("Tiv Taam: a club Promotion (1 - המועדון החדש) is audience club", async () => {
    const w = await real(chains.tivTaam, "tiv-taam", "000", "002", ["001547", "001547"]);
    expect(await w.line("4002631025069", 2)).toMatchObject({
      price: 7.5,
      quantity: 2,
      lineTotal: 12.9,
      promotion: { id: "251578", kind: "bundle", minQty: 2, audience: "club", text: "2 ב-₪12.90" },
    });
  });
});
