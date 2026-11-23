// What a store row on the Product page shows. Pure (no RN imports) so vitest can load it.
import type { ProductStore } from "./api";

/**
 * A store's row: its price (the Promotion's when one runs, over the struck `shelf` price), distance only with a
 * location, and Waze only for a store that has coordinates.
 */
export function storeRow(s: ProductStore) {
  const promo = s.promoPrice !== null;
  return {
    price: s.promoPrice ?? s.price,
    shelf: promo ? s.price : null,
    promoText: promo ? s.promoText : null,
    distanceKm: s.distanceKm ?? null,
    waze: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null,
  };
}
