import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestPromotions, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";
import { fakeClock } from "#/utils/clock.ts";

const OSHER = "7290103152017";
const YOHANANOF = "7290803800003";
const here = { lat: 32.0853, lng: 34.7818 };
const WEDNESDAY = new Date("2026-11-04T12:00:00+02:00");
const gtin = (base: string) => base + ((10 - ([...base].reverse().reduce((a, d, i) => a + Number(d) * (i % 2 ? 1 : 3), 0) % 10)) % 10);
const [E1, E2, SOAP, k1, k2, k3, l1, l2, l3, m1, m2, x1] = Array.from({ length: 12 }, (_, i) => gtin(`72900020000${String(i + 1).padStart(2, "0")}`)) as string[] & [string, string, string, string, string, string, string, string, string, string, string, string];

// --- builders -------------------------------------------------------------------------------------------------------
// [code, name, price, opts]: qty + unit read "500 גרם"; w = sold by the kilo (bIsWeighted 1).
type Opts = { w?: boolean; qty?: number; unit?: string };
type Item = [code: string, name: string, price: number, opts?: Opts];
const kg: Opts = { qty: 1, unit: "קילוגרם" };
const g500: Opts = { qty: 500, unit: "גרם" };
const litre: Opts = { qty: 1, unit: "ליטר" };
const ml500: Opts = { qty: 500, unit: "מל" };
const W: Opts = { w: true, qty: 1, unit: "קילוגרם" };

const storesXml = (chain: string) =>
  `<Root><ChainID>${chain}</ChainID><SubChains><SubChain><SubChainID>1</SubChainID><Stores><Store><StoreID>1</StoreID><StoreName>סניף</StoreName><Address>רחוב 1</Address><City>תל אביב</City></Store></Stores></SubChain></SubChains></Root>`;
const pricesXml = (chain: string, items: Item[]) =>
  `<Root><ChainID>${chain}</ChainID><SubChainID>1</SubChainID><StoreID>1</StoreID><Items>${items
    .map(([code, name, price, o]) => `<Item><ItemCode>${code}</ItemCode><ItemName>${name}</ItemName><ManufacturerName></ManufacturerName><UnitQty>${o?.unit ?? "יחידות"}</UnitQty><Quantity>${o?.qty ?? 1}</Quantity><bIsWeighted>${o?.w ? 1 : 0}</bIsWeighted><ItemPrice>${price}</ItemPrice><UnitOfMeasurePrice>${price}</UnitOfMeasurePrice></Item>`)
    .join("")}</Items></Root>`;

type Promo = {
  id: string;
  /** RewardType: 1 or 10 = N for a total, 2 = percent, 3 = fixed unit price, 11 = a kind Grocer cannot price (info-only). */
  reward: 1 | 2 | 3 | 10 | 11;
  items: string[];
  minQty?: number;
  price?: number;
  rate?: number;
  club?: string;
  end?: string;
  desc?: string;
  weighted?: boolean;
};
const promo = (p: Promo) =>
  `<Promotion><PromotionUpdateTime>2026-11-01T08:00:00.000</PromotionUpdateTime><AllowMultipleDiscounts>1</AllowMultipleDiscounts><PromotionID>${p.id}</PromotionID><PromotionDescription>${p.desc ?? `מבצע ${p.id}`}</PromotionDescription><PromotionStartDateTime>2026-11-01T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>${p.end ?? "2026-11-30T23:59:00.000"}</PromotionEndDateTime><PromotionStartHour /><PromotionEndHour /><PromotionDays></PromotionDays><RedemptionLimit>0</RedemptionLimit><MinNoOfItemOffered>10</MinNoOfItemOffered><ClubID>${p.club ?? "0 - כלל הלקוחות"}</ClubID><IsGiftItem /><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions /><Remarks /><Groups><Group><GroupID>1</GroupID><MinPurchaseAmount></MinPurchaseAmount><DiscountType></DiscountType><PromotionItems>${p.items
    .map(
      (code) =>
        `<PromotionItem><ItemCode>${code}</ItemCode><ItemType>1</ItemType><RewardType>${p.reward}</RewardType><MinQty>${(p.minQty ?? 1).toFixed(2)}</MinQty><MaxQty></MaxQty><DiscountRate>${p.rate ?? ""}</DiscountRate><DiscountedPrice>${(p.price ?? 0).toFixed(2)}</DiscountedPrice><DiscountedPricePerMida>${(p.price ?? 0).toFixed(2)}</DiscountedPricePerMida><bIsWeighted>${p.weighted ? 1 : 0}</bIsWeighted></PromotionItem>`,
    )
    .join("")}</PromotionItems></Group></Groups></Promotion>`;
const promosXml = (chain: string, promos: Promo[]) =>
  `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${chain}</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><BikoretNo>0</BikoretNo><Promotions>${promos.map(promo).join("")}</Promotions></Root>`;

// --- world ----------------------------------------------------------------------------------------------------------
type ChainSetup = { key: string; id: string; items: Item[]; promos: Promo[] };
const osher = (items: Item[], promos: Promo[] = []): ChainSetup => ({ key: "osher-ad", id: OSHER, items, promos });
const yohananof = (items: Item[], promos: Promo[] = []): ChainSetup => ({ key: "yohananof", id: YOHANANOF, items, promos });

type P = { id: string; kind: string; minQty: number; amount: number; audience: string; text: string };
type GroupLine = {
  ref: string; code: string; name: string; size: number; unitPrice?: number; price: number; quantity: number; lineTotal: number;
  promotion?: P; hints?: P[]; info?: { id: string; description: string }[];
};
type ProductLine = { code: string; price: number; quantity: number; lineTotal: number; promotion?: P };
type Store = { storeId: string; total: number; items: (GroupLine | ProductLine)[] };

async function world(chains: ChainSetup[], now = WEDNESDAY) {
  const deps = buildDeps(loadConfig(), { clock: fakeClock(now) });
  const app = createApp(deps);
  const setPos = deps.db.$client.prepare("UPDATE stores SET lat = ?, lng = ? WHERE chain_id = ?");
  chains.forEach((c, i) => {
    ingestStores(deps, c.key, storesXml(c.id));
    ingestPrices(deps, c.key, pricesXml(c.id, c.items), `PriceFull${c.id}-001-001-20261104-000000.xml`);
    ingestPromotions(deps, c.key, promosXml(c.id, c.promos), `PromoFull${c.id}-001-001-20261104-010000.xml`);
    setPos.run(here.lat + 0.0045 * (i + 1), here.lng, c.id);
  });
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "groups-promo@prices.test", password: "password1234", name: "Groups" }),
  });
  const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const post = (body: unknown, auth = true) =>
    app.request("/api/compare", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { cookie } : {}) }, body: JSON.stringify(body) });
  const compare = async (groups: [ref: string, quantity: number][], items: [string, number][] = [], sort?: "price") => {
    const res = await post({
      ...here,
      groups: groups.map(([ref, quantity]) => ({ ref, quantity })),
      ...(items.length ? { items: items.map(([code, quantity]) => ({ code, quantity })) } : {}),
      ...(sort ? { sort } : {}),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { stores: Store[] }).stores;
  };
  /** The first store's group line for `ref`. */
  const groupLine = async (ref: string, quantity = 1) => (await compare([[ref, quantity]]))[0]!.items.find((i): i is GroupLine => "ref" in i)!;
  return { post, compare, groupLine };
}

const p = (id: string, kind: string, minQty: number, amount: number, text: string, audience = "all"): P => ({ id, kind, minQty, amount, audience, text });
const EGGS = "ביצ|unit|12";
const eggL = (price: number): Item => [E1, "ביצים L 12 יח", price];
const eggM = (price: number): Item => [E2, "ביצים M 12 יח", price];

describe("Compare: a Product group's pick comes after Promotions", () => {
  it("unit group: a product on a fixed price beats a lower-Shelf one, and the line names it and its Promotion", async () => {
    const w = await world([osher([eggL(10), eggM(12)], [{ id: "401", reward: 3, items: [E2], price: 8 }])]);
    const l = await w.groupLine(EGGS);
    expect(l).toMatchObject({ ref: EGGS, code: E2, name: "ביצים M 12 יח", size: 12, price: 12, quantity: 1, lineTotal: 8, promotion: p("401", "price", 1, 8, "₪8 במקום ₪12") });
    expect(l).not.toHaveProperty("unitPrice");
    expect((await w.compare([[EGGS, 1]]))[0]!.total).toBe(8);
  });

  it("unit group at quantity 2: the Promotion applies to both packs, the quantity stays 2", async () => {
    const w = await world([osher([eggL(10), eggM(12)], [{ id: "401", reward: 3, items: [E2], price: 8 }])]);
    expect(await w.groupLine(EGGS, 2)).toMatchObject({ code: E2, price: 12, quantity: 2, lineTotal: 16, promotion: { id: "401" } });
  });

  it("a Promotion that still loses to a cheaper Shelf price leaves the cheaper product, with no promotion", async () => {
    const w = await world([osher([eggL(10), eggM(12)], [{ id: "402", reward: 3, items: [E2], price: 11 }])]);
    const l = await w.groupLine(EGGS);
    expect(l).toMatchObject({ code: E1, price: 10, lineTotal: 10 });
    expect(l).not.toHaveProperty("promotion");
  });

  it("an ended Promotion is ignored: the Shelf pick", async () => {
    const w = await world([osher([eggL(10), eggM(12)], [{ id: "403", reward: 3, items: [E2], price: 8, end: "2026-11-03T23:59:00.000" }])]);
    const l = await w.groupLine(EGGS);
    expect(l).toMatchObject({ code: E1, lineTotal: 10 });
    expect(l).not.toHaveProperty("promotion");
  });

  it("kilo group counted in packs: a percent Promotion on a 500 g product beats the 1 kg packs, bought in proportion", async () => {
    // commonest pack is 1 kg (two of three). Quantity 2 = 2 kg = 4 packs of 500 g at 3.80 less 20% = 3.04 each.
    const w = await world([
      osher(
        [[k1, "בורגול עבה סוגת", 7, kg], [k2, "בורגול דק סוגת", 7.2, kg], [k3, "בורגול גס מיה", 3.8, g500]],
        [{ id: "410", reward: 2, items: [k3], rate: 20 }],
      ),
    ]);
    const l = await w.groupLine("בורגול|kg", 2);
    // Shelf pick would be k1 at 7/kg = 14; k3 is 7.60/kg
    expect(l).toMatchObject({ code: k3, name: "בורגול גס מיה", size: 0.5, unitPrice: 7.6, price: 7.6, quantity: 2, lineTotal: 12.16, promotion: p("410", "percent", 1, 20, "20% הנחה") });
  });

  it("liter group: a bundle on a 500 ml product reached by the pack count (2 L = 4 packs: 8 + one Shelf price)", async () => {
    const w = await world([
      osher(
        [[l1, "מיץ תפוזים 1 ליטר", 6, litre], [l2, "מיץ ענבים 1 ליטר", 6.5, litre], [l3, "מיץ תפוחים 500 מל", 3.2, ml500]],
        [{ id: "501", reward: 1, items: [l3], minQty: 3, price: 8 }],
      ),
    ]);
    const l = await w.groupLine("מיץ|l", 2);
    // l1 at 12 loses to l3: 8 + 3.20 = 11.20
    expect(l).toMatchObject({ code: l3, size: 0.5, unitPrice: 6.4, price: 6.4, quantity: 2, lineTotal: 11.2, promotion: p("501", "bundle", 3, 8, "3 ב-₪8") });
    expect(l).not.toHaveProperty("hints");
  });

  it("liter group: a bundle the packs do not reach is a hint only on the chosen product's line", async () => {
    const w = await world([
      osher(
        [[l1, "מיץ תפוזים 1 ליטר", 6, litre], [l2, "מיץ ענבים 1 ליטר", 6.5, litre], [l3, "מיץ תפוחים 500 מל", 3.2, ml500]],
        [
          { id: "501", reward: 1, items: [l3], minQty: 3, price: 8 }, // 2 packs of l3 don't reach it, and l3 isn't chosen
          { id: "502", reward: 1, items: [l1], minQty: 3, price: 15 },
        ],
      ),
    ]);
    const l = await w.groupLine("מיץ|l", 1);
    expect(l).toMatchObject({ code: l1, price: 6, quantity: 1, lineTotal: 6 });
    expect(l).not.toHaveProperty("promotion");
    expect(l.hints).toEqual([p("502", "bundle", 3, 15, "3 ב-₪15")]);
  });

  it("weight group (produce sold by weight): a per-kilo price on one product wins, quantity in kilos", async () => {
    const w = await world([
      osher([[m1, "מלפפון", 8, W], [m2, "מלפפון חממה", 9, W]], [{ id: "420", reward: 3, items: [m2], minQty: 0.01, price: 6, weighted: true }]),
    ]);
    const l = await w.groupLine("מלפפון|kg", 1.5);
    // Shelf pick m1 would be 12
    expect(l).toMatchObject({ code: m2, name: "מלפפון חממה", unitPrice: 9, price: 9, quantity: 1.5, lineTotal: 9, promotion: p("420", "price", 1, 6, "₪6 לק״ג") });
  });

  it("names a Restricted Promotion's audience on the line", async () => {
    const w = await world([osher([eggL(10), eggM(12)], [{ id: "430", reward: 3, items: [E2], price: 8, club: "1 - המועדון החדש" }])]);
    expect(await w.groupLine(EGGS)).toMatchObject({ code: E2, lineTotal: 8, promotion: p("430", "price", 1, 8, "₪8 במקום ₪12", "club") });
  });

  it("mix-and-match: a bundle over a product line and a group member pools their units", async () => {
    const w = await world([
      osher([eggL(6), eggM(5.5), [SOAP, "סבון נוזלי", 5]], [{ id: "440", reward: 10, items: [SOAP, E1], minQty: 2, price: 8 }]),
    ]);
    const [s] = await w.compare([[EGGS, 1]], [[SOAP, 1]]);
    const group = s!.items.find((i): i is GroupLine => "ref" in i)!;
    const soap = s!.items.find((i) => i.code === SOAP)!;
    // pool 6 + 5 = 11 for 8 (beats eggM 5.5 + 5 = 10.5): 8*6/11 = 4.36 and 8*5/11 = 3.64
    expect(group).toMatchObject({ code: E1, price: 6, lineTotal: 4.36, promotion: p("440", "bundle", 2, 8, "2 ב-₪8") });
    expect(soap).toMatchObject({ price: 5, lineTotal: 3.64, promotion: { id: "440" } });
    expect(s!.total).toBe(8);
  });

  it("info-only Promotion on the chosen product is listed in info; another member's is not", async () => {
    const w = await world([
      osher([eggL(10), eggM(12)], [
        { id: "450", reward: 11, items: [E1], desc: "מתנה לקונים" },
        { id: "451", reward: 11, items: [E2], desc: "הטבה אחרת" },
      ]),
    ]);
    const l = await w.groupLine(EGGS);
    expect(l).toMatchObject({ code: E1, price: 10, lineTotal: 10 });
    expect(l.info).toEqual([{ id: "450", description: "מתנה לקונים" }]);
  });

  it("store total and price sort use the after-Promotion lineTotal", async () => {
    const w = await world([
      yohananof([eggL(10)]), // total 10
      osher([eggL(12), eggM(11.5)], [{ id: "460", reward: 3, items: [E1], price: 7 }]), // Shelf pick 11.50, after Promotions 7
    ]);
    const stores = await w.compare([[EGGS, 1]], [], "price");
    expect(stores.map((s) => s.storeId.split("-")[0])).toEqual([OSHER, YOHANANOF]);
    expect(stores.map((s) => s.total)).toEqual([7, 10]);
  });

  it("group membership is unchanged: a product on the same Promotion whose name does not fit never becomes the pick", async () => {
    const dish: Item = [x1, "ביצים עם שוקולד 12 יח", 5]; // "עם" is a qualifier the group's words lack
    const w = await world([osher([eggL(14), dish], [{ id: "470", reward: 2, items: [E1, x1], rate: 50 }])]);
    expect(await w.groupLine(EGGS)).toMatchObject({ code: E1, name: "ביצים L 12 יח", price: 14, lineTotal: 7, promotion: { id: "470", kind: "percent" } });
  });

  it("401 without a session", async () => {
    const w = await world([osher([eggL(10)])]);
    expect((await w.post({ ...here, groups: [{ ref: EGGS }] }, false)).status).toBe(401);
  });
});
