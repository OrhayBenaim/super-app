// Chains we know how to ingest. ChainIds and sources: docs/research/price-data.md section 1 (OIS scraper classes).
// orderUrl: no chain documents a barcode-search deep link (section 6), so every entry is the shop home page;
// null where the shop URL was not researched.
export type ChainSeed = {
  ids: string[]; // ChainId(s) seen in files; ids[0] is chains.id
  key: string;
  name: string;
  nameHe: string;
  source: { cerberus: string; host?: string } | { url: string };
  orderUrl: string | null;
};

export const chainSeeds: ChainSeed[] = [
  { ids: ["7290027600007"], key: "shufersal", name: "Shufersal", nameHe: "שופרסל", source: { url: "https://prices.shufersal.co.il/" }, orderUrl: "https://www.shufersal.co.il/online/he/" },
  { ids: ["7290058140886"], key: "rami-levy", name: "Rami Levy", nameHe: "רמי לוי", source: { cerberus: "RamiLevi" }, orderUrl: "https://www.rami-levy.co.il/he/online/market" },
  { ids: ["7290803800003"], key: "yohananof", name: "Yohananof", nameHe: "יוחננוף", source: { cerberus: "yohananof" }, orderUrl: "https://yochananof.co.il/" },
  { ids: ["7290103152017"], key: "osher-ad", name: "Osher Ad", nameHe: "אושר עד", source: { cerberus: "osherad" }, orderUrl: "https://osherad.co.il/" },
  { ids: ["7290873255550"], key: "tiv-taam", name: "Tiv Taam", nameHe: "טיב טעם", source: { cerberus: "TivTaam" }, orderUrl: null },
  { ids: ["7290696200003", "7290058103393"], key: "victory", name: "Victory", nameHe: "ויקטורי", source: { url: "https://laibcatalog.co.il/victory/index.html" }, orderUrl: "https://www.victoryonline.co.il/" },
  { ids: ["7290055700007"], key: "carrefour", name: "Carrefour / Mega / Yeinot Bitan", nameHe: "קרפור / מגה / יינות ביתן", source: { url: "https://prices.carrefour.co.il/" }, orderUrl: null },
  { ids: ["7290700100008"], key: "hazi-hinam", name: "Hazi Hinam", nameHe: "חצי חינם", source: { url: "https://shop.hazi-hinam.co.il/Prices" }, orderUrl: "https://shop.hazi-hinam.co.il/" },
  { ids: ["7290785400000"], key: "keshet", name: "Keshet Taamim", nameHe: "קשת טעמים", source: { cerberus: "Keshet" }, orderUrl: null },
  { ids: ["7290639000004"], key: "stop-market", name: "Stop Market", nameHe: "סטופ מרקט", source: { cerberus: "Stop_Market", host: "url.retail.publishedprices.co.il" }, orderUrl: null },
  { ids: ["7290492000005"], key: "dor-alon", name: "Dor Alon", nameHe: "דור אלון", source: { cerberus: "doralon" }, orderUrl: null },
  { ids: ["7290661400001", "7290633800006"], key: "machsanei-hashuk", name: "Machsanei Hashuk", nameHe: "מחסני השוק", source: { url: "https://laibcatalog.co.il/mshuk/index.html" }, orderUrl: null },
];
