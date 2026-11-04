// What a Promotions card shows. Pure (no RN imports) so vitest can load it; callers pass t(). Mirrors apps/api/src/prices/browse.ts.
import type { ProductType } from "@grocer/shared/product-types";
import { fmt, shekels } from "@/features/compare/format";
import { promotionText } from "@/features/compare/promotion";
import type { Promotion } from "@/features/compare/sort";
import { nearQuery, type Card } from "@/features/home/api";
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

/** The short label for a Restricted price on a card ("במועדון", "בכרטיס", "עם קופון"); none for everyone. */
export const restrictedKey = (audience: Audience): StringKey | undefined =>
  audience === "all" ? undefined : ({ club: "promotions.club", card: "promotions.card", coupon: "promotions.coupon" } as const)[audience];

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
    deal: card.kind === "info" ? card.text : card.kind === "price" ? undefined : promotionText({ ...card, kind: card.kind, id: card.ref }, card.soldBy, t),
    restricted: key && t(key),
    chains: chainsLabel(card.chainCount, t),
  };
}

/** The Promotions query string: Home's rounded location and radius, plus the Product type and Chain picked. */
export const promotionsQuery = (coords: Coords, radiusKm: number, type: ProductType | null, chain: string | null) =>
  nearQuery(coords, radiusKm) + (type ? `&type=${type}` : "") + (chain ? `&chain=${chain}` : "");
