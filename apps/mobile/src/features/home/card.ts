// What a browse card (Home, Promotions, product pages) shows and sends. Pure (no RN imports) so vitest can load it.
import type { ProductType } from "@grocer/shared/product-types";
import { QUANTITY, type SoldBy } from "@grocer/shared/quantity";
import { groupTitle } from "@/features/items/labels";
import type { Item } from "@/features/lists/api";
import { t, type StringKey } from "@/lib/strings";
import type { Card } from "./api";

/**
 * What a card adds: a Product group (its ref, plus its Products' codes so an Item matched to one of them counts) or one
 * Product. `category` is the Product type's name in the User's language.
 */
export type CardTarget = { name: string; category: string; soldBy: SoldBy } & (
  | { groupRef: string; codes: readonly string[]; productCode?: never }
  | { productCode: string; groupRef?: never; codes?: never }
);

export type CardAction = "add" | "onList" | "update" | "switch";
export type CardView = {
  /** The Item matched to the target, on the List or off it. */
  item?: Item;
  action: CardAction;
  soldBy: SoldBy;
  quantity: number;
  canLess: boolean;
  canMore: boolean;
};

const matches = (i: Item, t: CardTarget) =>
  t.groupRef !== undefined ? i.groupRef === t.groupRef || (!!i.productCode && t.codes.includes(i.productCode)) : i.productCode === t.productCode;

/**
 * The card for `picked` (the stepper's value; null until the User changes it). Matched to an Item on the List, it starts
 * at that Item's Quantity and shows "on the List" until the stepper differs, then Update. Otherwise Add, from 1.
 */
export function cardView(items: Item[], target: CardTarget, picked: number | null): CardView {
  const matched = items.filter((i) => matches(i, target));
  const item = matched.find((i) => i.missing) ?? matched[0];
  const onList = !!item?.missing;
  const soldBy = item?.soldBy ?? target.soldBy;
  const start = onList ? item.quantity : QUANTITY.start;
  const quantity = picked ?? start;
  return {
    item,
    action: !onList ? "add" : quantity === item.quantity ? "onList" : "update",
    soldBy,
    quantity,
    canLess: quantity > QUANTITY.step[soldBy],
    canMore: quantity < QUANTITY.max,
  };
}

export type AddBody = { name: string; category: string; groupRef?: string; productCode?: string; quantity: number; missing: true };
export type CardSend =
  | { kind: "add"; body: AddBody }
  | { kind: "update"; id: string; patch: { quantity: number; missing?: true; productCode?: string } }
  | null;

/**
 * A Product row on its group's product page. While an Item on the List is matched to the group or to another of its
 * Products, the row offers "switch to this" (that Item, re-matched: still one Item) at the Item's Quantity, or from 1
 * when this Product is Sold by the other way. Otherwise it is a card for the Product itself.
 */
export function productView(items: Item[], group: CardTarget, product: CardTarget, picked: number | null): CardView {
  const own = cardView(items, product, picked);
  const held = cardView(items, group, null);
  if (own.action !== "add" || held.action === "add") return own;
  const item = held.item!;
  const soldBy = product.soldBy;
  const quantity = picked ?? (item.soldBy === soldBy ? item.quantity : QUANTITY.start);
  return { item, action: "switch", soldBy, quantity, canLess: quantity > QUANTITY.step[soldBy], canMore: quantity < QUANTITY.max };
}

/**
 * What the action button sends. Switch re-matches the Item to the Product with the row's Quantity. Add creates an Item on the List matched to the target, or, when an Item off the List
 * already matches, puts that one back (never a second Item). Update changes the Quantity only.
 */
export function cardSend({ item, action, quantity }: CardView, target: CardTarget): CardSend {
  if (action === "onList") return null;
  if (action === "switch") return { kind: "update", id: item!.id, patch: { productCode: target.productCode!, quantity } };
  if (item) return { kind: "update", id: item.id, patch: action === "add" ? { missing: true, quantity } : { quantity } };
  const match = target.groupRef !== undefined ? { groupRef: target.groupRef } : { productCode: target.productCode };
  return { kind: "add", body: { name: target.name, category: target.category, ...match, quantity, missing: true } };
}

// Other is the existing "Other" category, so a List never has two.
const TYPE_NAMES: Record<ProductType, StringKey> = {
  "dairy-eggs": "productType.dairyEggs",
  "meat-fish": "productType.meatFish",
  produce: "productType.produce",
  bakery: "productType.bakery",
  drinks: "productType.drinks",
  "snacks-sweets": "productType.snacksSweets",
  pantry: "productType.pantry",
  frozen: "productType.frozen",
  canned: "productType.canned",
  "cleaning-home": "productType.cleaningHome",
  "personal-care": "productType.personalCare",
  baby: "productType.baby",
  pets: "productType.pets",
  alcohol: "productType.alcohol",
  other: "items.category.other",
};

/** The strings key of a Product type's name. */
export const typeNameKey = (type: ProductType): StringKey => TYPE_NAMES[type];

/**
 * What Add puts on the List for a browse card: the group, named as search names it, in its Product type's category; a
 * lone Product with no group ref by its code, under its own name.
 */
export const groupTarget = (card: Card, type: ProductType): CardTarget => {
  const base = { category: t(typeNameKey(type)), soldBy: card.soldBy };
  return card.ref === null
    ? { ...base, name: card.name, productCode: card.code }
    : { ...base, name: groupTitle(card, t), groupRef: card.ref, codes: card.codes };
};
