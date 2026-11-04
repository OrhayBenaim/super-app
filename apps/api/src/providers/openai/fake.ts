import type { ProductType } from "@grocer/shared/product-types";
import type { Classifier, ProductToClassify } from "#/services/classifier.ts";

/**
 * Answers from `lookup`: a name -> type map (a name not in it is "other"), or a function. A function that throws fails
 * the whole request, like an HTTP error; one that returns null is an answer outside the fixed list. Records each batch.
 */
export function fakeClassifier(lookup: Record<string, ProductType | null> | ((p: ProductToClassify) => ProductType | null) = {}) {
  const answer = typeof lookup === "function" ? lookup : (p: ProductToClassify) => (p.name in lookup ? lookup[p.name]! : "other");
  const calls: ProductToClassify[][] = [];
  const fake = {
    calls,
    async classify(products: ProductToClassify[]) {
      calls.push(products);
      return products.map(answer);
    },
  };
  return fake satisfies Classifier;
}
