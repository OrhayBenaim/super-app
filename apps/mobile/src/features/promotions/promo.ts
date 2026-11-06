// What a Promotions card shows. Pure (no RN imports) so vitest can load it; callers pass t(). Mirrors apps/api/src/prices/browse.ts.
import type { ProductType } from "@grocer/shared/product-types";
import type { SoldBy } from "@grocer/shared/quantity";
import { fmt, shekels } from "@/features/compare/format";
import { AUDIENCE_KEYS, audienceLabel, promotionText } from "@/features/compare/promotion";
import type { Promotion } from "@/features/compare/sort";
import { nearQuery, type Card, type GroupProduct } from "@/features/home/api";
import { fromPrice, priceLabel } from "@/features/items/labels";
import type { Coords } from "@/lib/location";
import type { StringKey, t as translate } from "@/lib/strings";

type T = typeof translate;
type Audience = Promotion["audience"];

/**
 * A group card of the Products on a Promotion nearby, headlined by its lowest Promotion price per kilo, liter or pack
 * (null when none can be worked out) and that offer's Shelf price. `text` is the server's Hebrew text (for info-only
 * ones, the Chain's description).
 */
export type PromoCard = Card & {
  type: ProductType; promoPrice: number | null; shelfPrice: number | null; saving: number | null;
  kind: Promotion["kind"] | "info"; minQty: number; amount: number; audience: Audience; text: string; chainCount: number;
};

/** One page of GET /api/browse/promotions and the next page's number (null on the last). */
export type PromoCardsPage = { cards: PromoCard[]; next: number | null };

/** A card's list key: its group ref, else its Product code. */
export const promoKey = (c: PromoCard) => c.ref ?? c.code;

/** The loaded pages' cards in order, each once: a Price sync between two pages can move a card onto the next one. */
export const loadedCards = (pages: PromoCardsPage[] = []) => [...new Map(pages.flatMap((p) => p.cards).map((c) => [promoKey(c), c])).values()];

/** The short label for a Restricted price on a card ("במועדון", "בכרטיס", "עם קופון"); none for everyone. */
export const restrictedKey = (audience: Audience): StringKey | undefined =>
  audience === "all" ? undefined : AUDIENCE_KEYS[audience].short;

/** "ב-2 רשתות", "ברשת אחת". */
export const chainsLabel = (n: number, t: T) => (n === 1 ? t("promotions.chains.one") : fmt(t("promotions.chains"), { n }));

/**
 * A card's lines: the Promotion `price` (per kilo or liter for those groups) and the struck `shelf` price (`shelfLabel`
 * speaks it), the reward in words (`deal`) when one unit's price alone would mislead (a set, a percent) or there is no
 * price (the Chain's description), the Restricted label and the Chain count.
 */
export function promoLines(card: PromoCard, t: T) {
  const per = (price: number) =>
    card.measure === "unit" ? shekels(price) : fmt(t(card.measure === "kg" ? "quantity.perKg" : "items.group.liter"), { price: shekels(price) });
  const key = restrictedKey(card.audience);
  return {
    price: card.promoPrice === null ? undefined : per(card.promoPrice),
    shelf: card.shelfPrice === null ? undefined : shekels(card.shelfPrice),
    shelfLabel: card.shelfPrice === null ? undefined : fmt(t("promotions.instead"), { price: shekels(card.shelfPrice) }),
    deal: card.kind === "info" ? card.text : card.kind === "price" ? undefined : promotionText({ ...card, kind: card.kind, id: card.ref ?? card.code }, card.soldBy, t),
    restricted: key && t(key),
    chains: chainsLabel(card.chainCount, t),
  };
}

/** The Promotions query string: Home's rounded location and radius, plus the Product type and Chain picked. */
export const promotionsQuery = (coords: Coords, radiusKm: number, type: ProductType | null, chain: string | null) =>
  nearQuery(coords, radiusKm) + (type ? `&type=${type}` : "") + (chain ? `&chain=${chain}` : "");

/**
 * One Chain's Promotion on a Product (its best offer at the Chain's nearby stores): the Promotion price per unit (per
 * kilo when weighed) and that store's Shelf price, both null when there is no price we can work out (then `text` is
 * the Chain's own description).
 */
export type ChainPromo = {
  chainId: string; promoPrice: number | null; shelfPrice: number | null; saving: number | null;
  kind: PromoCard["kind"]; minQty: number; amount: number; audience: Audience; text: string;
};
/** A Promotions card's product page: the card and only its Products on a Promotion nearby, each broken down by Chain. */
export type PromoPage = { card: PromoCard; products: (GroupProduct & { chains: ChainPromo[] })[] };

/**
 * A Chain's line under a Product (Figma ChainPromoRow): the Promotion `price` and struck `shelf` price, the reward in
 * words (`text`; the Chain's description when `info`), the long Restricted label and the whole line's spoken `label`
 * (the Shelf price read as "instead of ₪X").
 */
export function chainLine(c: ChainPromo, chainName: string, soldBy: SoldBy, t: T) {
  const info = c.promoPrice === null || c.kind === "info";
  const price = info ? undefined : priceLabel(c.promoPrice!, soldBy, t);
  const shelf = info ? undefined : priceLabel(c.shelfPrice!, soldBy, t);
  const text = info ? c.text : promotionText({ ...c, kind: c.kind as Promotion["kind"], id: c.chainId }, soldBy, t);
  const restricted = audienceLabel(c.audience, t);
  const spokenShelf = shelf && fmt(t("promotions.instead"), { price: shelf });
  return { price, shelf, text, restricted, info, label: [chainName, price, spokenShelf, text, restricted].filter(Boolean).join(", ") };
}

/** "מבצעים ב-4 רשתות · מ-₪4.50 לליטר": the product page's subtitle. */
export const pageSubtitle = (card: PromoCard, t: T) =>
  [
    card.chainCount === 1 ? t("promotions.page.chains.one") : fmt(t("promotions.page.chains"), { n: card.chainCount }),
    card.promoPrice === null ? null : fromPrice(card.measure, card.promoPrice, t),
  ].filter(Boolean).join(" · ");
