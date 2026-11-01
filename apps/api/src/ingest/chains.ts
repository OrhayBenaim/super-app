// Chains we know how to ingest. ChainIds and sources: docs/research/price-data.md section 1; every Cerberus ChainId
// below was seen in that chain's own Stores and PriceFull files on 2026-11-01 (section "Verified live").
// orderUrl: shop home page, verified reachable from Israel per research; 403 from US IPs (Cloudflare/Radware) is expected.
// No barcode-search template: Shufersal's /online/he/search?text=<code> served a maintenance image, not a product.
export type ChainSeed = {
  ids: string[]; // ChainId(s) seen in files; ids[0] is chains.id
  key: string;
  name: string;
  nameHe: string;
  source: { cerberus: string } | { url: string };
  orderUrl: string | null;
};

export const chainSeeds: ChainSeed[] = [
  { ids: ["7290027600007"], key: "shufersal", name: "Shufersal", nameHe: "שופרסל", source: { url: "https://prices.shufersal.co.il/" }, orderUrl: "https://www.shufersal.co.il/online/he/" },
  { ids: ["7290058140886"], key: "rami-levy", name: "Rami Levy", nameHe: "רמי לוי", source: { cerberus: "RamiLevi" }, orderUrl: "https://www.rami-levy.co.il/he/online" },
  { ids: ["7290803800003"], key: "yohananof", name: "Yohananof", nameHe: "יוחננוף", source: { cerberus: "yohananof" }, orderUrl: "https://yochananof.co.il/" },
  { ids: ["7290103152017"], key: "osher-ad", name: "Osher Ad", nameHe: "אושר עד", source: { cerberus: "osherad" }, orderUrl: "https://www.osherad.co.il/" },
  { ids: ["7290873255550"], key: "tiv-taam", name: "Tiv Taam", nameHe: "טיב טעם", source: { cerberus: "TivTaam" }, orderUrl: "https://www.tivtaam.co.il/" },
  { ids: ["7290696200003", "7290058103393"], key: "victory", name: "Victory", nameHe: "ויקטורי", source: { url: "https://laibcatalog.co.il/victory/index.html" }, orderUrl: "https://www.victoryonline.co.il/" },
  { ids: ["7290055700007"], key: "carrefour", name: "Carrefour / Mega / Yeinot Bitan", nameHe: "קרפור / מגה / יינות ביתן", source: { url: "https://prices.carrefour.co.il/" }, orderUrl: null },
  { ids: ["7290700100008"], key: "hazi-hinam", name: "Hazi Hinam", nameHe: "חצי חינם", source: { url: "https://shop.hazi-hinam.co.il/Prices" }, orderUrl: "https://shop.hazi-hinam.co.il/" },
  { ids: ["7290785400000"], key: "keshet", name: "Keshet Taamim", nameHe: "קשת טעמים", source: { cerberus: "Keshet" }, orderUrl: null },
  { ids: ["7290639000004"], key: "stop-market", name: "Stop Market", nameHe: "סטופ מרקט", source: { cerberus: "Stop_Market" }, orderUrl: "https://www.stopmarket.co.il/" },
  { ids: ["7290492000005"], key: "dor-alon", name: "Dor Alon", nameHe: "דור אלון", source: { cerberus: "doralon" }, orderUrl: null },
  { ids: ["7290661400001", "7290633800006"], key: "machsanei-hashuk", name: "Machsanei Hashuk", nameHe: "מחסני השוק", source: { url: "https://laibcatalog.co.il/mshuk/index.html" }, orderUrl: null },
  { ids: ["7290876100000"], key: "fresh-market", name: "Fresh Market", nameHe: "פרש מרקט", source: { cerberus: "freshmarket" }, orderUrl: "https://www.freshmarket.co.il/" },
  { ids: ["7291059100008"], key: "politzer", name: "Politzer", nameHe: "פוליצר", source: { cerberus: "politzer" }, orderUrl: null },
  { ids: ["7290526500006"], key: "salach-dabach", name: "Salach Dabach", nameHe: "סאלח דבאח", source: { cerberus: "SalachD" }, orderUrl: null },
];

export function chainByKey(key: string) {
  const chain = chainSeeds.find((c) => c.key === key);
  if (!chain) throw new Error(`unknown chain "${key}"; one of: ${chainSeeds.map((c) => c.key).join(", ")}`);
  return chain;
}
