import type { ProductType } from "@grocer/shared/product-types";
import type { Classified, Classifier, ProductToClassify } from "#/services/classifier.ts";

/**
 * Answers from `lookup`: a name -> type map (a name not in it is "other"), or a function. A function that throws fails
 * the whole request, like an HTTP error; one that returns null is an answer outside the fixed list. `names` maps a name
 * to the full name the fake writes for it (a name not in it comes back as sent). Records each batch.
 */
export function fakeClassifier(
  lookup: Record<string, ProductType | null> | ((p: ProductToClassify) => ProductType | null) = {},
  names: Record<string, string> = {},
) {
  const answer = typeof lookup === "function" ? lookup : (p: ProductToClassify) => (p.name in lookup ? lookup[p.name]! : "other");
  const calls: ProductToClassify[][] = [];
  const fake = {
    calls,
    async classify(products: ProductToClassify[]) {
      calls.push(products);
      return products.map((p): Classified => ({ type: answer(p), name: names[p.name] ?? p.name }));
    },
  };
  return fake satisfies Classifier;
}
