import type { ProductType } from "@grocer/shared/product-types";
import type { SoldBy } from "@grocer/shared/quantity";

/** What the classifier sees of a Product. `size` is e.g. "0.5 kg", "1 l", "12 unit"; null when it can't be read. */
export type ProductToClassify = { name: string; manufacturer: string | null; size: string | null; soldBy: SoldBy };

/** Gives Products a Product type from what they say about themselves. */
export interface Classifier {
  /** One answer per Product, in order: its type, or null when the answer is not one of the fixed ids. Throws when the request fails. */
  classify(products: ProductToClassify[]): Promise<(ProductType | null)[]>;
}

/** What goes in each Product type, for any classifier to tell its model (the id alone is not enough). */
export const PRODUCT_TYPE_GUIDE: Record<ProductType, string> = {
  "dairy-eggs": "milk, cheese, yogurt, butter, cream, eggs, dairy desserts",
  "meat-fish": "fresh or chilled meat, poultry, fish, deli meats",
  produce: "fresh fruit, vegetables, herbs",
  bakery: "bread, pita, rolls, cakes and pastries from the bakery",
  drinks: "water, juice, soft drinks, coffee, tea, non-alcoholic drinks",
  "snacks-sweets": "chocolate, candy, chips, crackers, biscuits, nuts as snacks",
  pantry: "rice, pasta, flour, sugar, oil, spices, sauces, spreads, cereal, dry goods",
  frozen: "frozen food of any kind",
  canned: "canned and jarred food: vegetables, tuna, pickles, hummus in cans",
  "cleaning-home": "cleaning products, laundry, dishwashing, paper goods, disposables, home supplies",
  "personal-care": "toiletries, cosmetics, hygiene, pharmacy",
  baby: "diapers, baby food, formula, baby care",
  pets: "pet food and pet supplies",
  alcohol: "beer, wine, spirits",
  other: "anything that fits none of the above",
};
