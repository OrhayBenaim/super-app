// Chains we know how to ingest. ChainIds and sources: docs/research/price-data.md section 1; every chain's ids[0] except
// Hazi Hinam's (no downloader yet) was seen in its own portal's files on 2026-11-01 (sections "Verified live"). The second
// ids of Victory and Machsanei Hashuk were not: their portals list only ids[0].
// orderUrl: the online shop (docs/research/price-data.md section 6), null when the chain sells nothing online. A cart link
// template has {items}, filled with `barcode,quantity;...`: Rami Levy's /he/basket fills the cart; the Stor.ai shops'
// externalCart opens their "add these to cart" dialog. Both are undocumented and found in the shops' own code.
// onlineStore: the StoreId whose price file is the online shop's (named so in the chain's Stores file, seen 2026-11-04),
// set only for cart link chains: the cart buys each Product group's product from it. Tiv Taam has a picking store per
// area and the other Stor.ai shops none, so their carts keep the compared branch's products.
const storAi = (domain: string) => `https://${domain}/?externalCart={items}&externalName=Grocer`;
export type ChainSeed = {
  ids: string[]; // ChainId(s) seen in files; ids[0] is chains.id
  key: string;
  name: string;
  nameHe: string;
  source: { cerberus: string } | { url: string };
  orderUrl: string | null;
  onlineStore?: string;
};

export const chainSeeds: ChainSeed[] = [
  { ids: ["7290027600007"], key: "shufersal", name: "Shufersal", nameHe: "שופרסל", source: { url: "https://prices.shufersal.co.il/" }, orderUrl: "https://www.shufersal.co.il/online/he/" },
  { ids: ["7290058140886"], key: "rami-levy", name: "Rami Levy", nameHe: "רמי לוי", source: { cerberus: "RamiLevi" }, orderUrl: "https://www.rami-levy.co.il/he/basket?items={items}", onlineStore: "39" },
  { ids: ["7290803800003"], key: "yohananof", name: "Yohananof", nameHe: "יוחננוף", source: { cerberus: "yohananof" }, orderUrl: "https://yochananof.co.il/" },
  { ids: ["7290103152017"], key: "osher-ad", name: "Osher Ad", nameHe: "אושר עד", source: { cerberus: "osherad" }, orderUrl: null },
  { ids: ["7290873255550"], key: "tiv-taam", name: "Tiv Taam", nameHe: "טיב טעם", source: { cerberus: "TivTaam" }, orderUrl: storAi("www.tivtaam.co.il") },
  { ids: ["7290696200003", "7290058103393"], key: "victory", name: "Victory", nameHe: "ויקטורי", source: { url: "https://laibcatalog.co.il/victory/index.html" }, orderUrl: storAi("www.victoryonline.co.il"), onlineStore: "97" },
  { ids: ["7290055700007"], key: "carrefour", name: "Carrefour", nameHe: "קרפור", source: { url: "https://prices.carrefour.co.il/" }, orderUrl: storAi("www.carrefour.co.il"), onlineStore: "471" },
  { ids: ["7290700100008"], key: "hazi-hinam", name: "Hazi Hinam", nameHe: "חצי חינם", source: { url: "https://shop.hazi-hinam.co.il/Prices" }, orderUrl: "https://shop.hazi-hinam.co.il/" },
  { ids: ["7290785400000"], key: "keshet", name: "Keshet Taamim", nameHe: "קשת טעמים", source: { cerberus: "Keshet" }, orderUrl: storAi("www.keshet-teamim.co.il") },
  { ids: ["7290639000004"], key: "stop-market", name: "Stop Market", nameHe: "סטופ מרקט", source: { cerberus: "Stop_Market" }, orderUrl: null },
  { ids: ["7290492000005"], key: "dor-alon", name: "Dor Alon", nameHe: "דור אלון", source: { cerberus: "doralon" }, orderUrl: null },
  { ids: ["7290661400001", "7290633800006"], key: "machsanei-hashuk", name: "Machsanei Hashuk", nameHe: "מחסני השוק", source: { url: "https://laibcatalog.co.il/mshuk/index.html" }, orderUrl: storAi("www.mck.co.il") },
  { ids: ["7290876100000"], key: "fresh-market", name: "Fresh Market", nameHe: "פרש מרקט", source: { cerberus: "freshmarket" }, orderUrl: storAi("www.freshmarket.co.il") },
  { ids: ["7291059100008"], key: "politzer", name: "Politzer", nameHe: "פוליצר", source: { cerberus: "politzer" }, orderUrl: storAi("www.politzer-c.co.il") },
  { ids: ["7290526500006"], key: "salach-dabach", name: "Salach Dabach", nameHe: "סאלח דבאח", source: { cerberus: "SalachD" }, orderUrl: null },
];

export function chainByKey(key: string) {
  const chain = chainSeeds.find((c) => c.key === key);
  if (!chain) throw new Error(`unknown chain "${key}"; one of: ${chainSeeds.map((c) => c.key).join(", ")}`);
  return chain;
}
