import type { ProductType } from "@grocer/shared/product-types";
import type { SoldBy } from "@grocer/shared/quantity";

/** What the classifier sees of a Product. `size` is e.g. "0.5 kg", "1 l", "12 unit"; null when it can't be read. */
export type ProductToClassify = { name: string; manufacturer: string | null; size: string | null; soldBy: SoldBy };

/** Gives Products a Product type from what they say about themselves. */
export interface Classifier {
  /** One answer per Product, in order: its type, or null when the answer is not one of the fixed ids. Throws when the request fails. */
  classify(products: ProductToClassify[]): Promise<(ProductType | null)[]>;
}
