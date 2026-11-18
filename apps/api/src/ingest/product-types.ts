// The Product type step of a Price sync (CONTEXT.md "Product type", docs/adr/0003).
import type { ProductType } from "@grocer/shared/product-types";
import type { Deps } from "#/deps.ts";
import { measureOf, soldByOf } from "#/prices/groups.ts";
import { RateLimitError, type ProductToClassify } from "#/services/classifier.ts";

const BATCH = 100;
/** Distinct names classified per Price sync; the rest wait for the next. */
export const MAX_NAMES = 5000;

type Row = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number; productType: ProductType | null };

const numbers = (name: string) => (name.match(/\d+(?:[.,]\d+)?/g) ?? []).join(" ");

/**
 * Gives a Product type and a full Product name (docs/adr/0010) to the untyped Products that have a current price: each
 * distinct name once (trimmed, spaces folded), in batches, up to MAX_NAMES names, saving each answer on every such
 * Product of that name. A name whose numbers differ from the one sent is not saved (its type is). Never throws:
 * a failed request or an answer outside the list leaves its Products as they were for the next sync, and a rate limit
 * stops the step, leaving the batches not sent for the next sync too. Null when skipped.
 *
 * `full` (the local cleanup script): every Product with a current price, no cap. A name whose Products all have a type
 * other than Other is sent for its name only and they keep their type; a name with any Other or untyped Product is sent
 * for both, and only those Products take the answered type (the others keep theirs and get the name).
 */
export async function typeProducts({ db, classifier, errorHandler }: Deps, signal?: AbortSignal, { full = false } = {}) {
  if (!classifier) {
    console.log("product types: skipped, LLM_BASE_URL, LLM_API_KEY and LLM_MODEL are not all set");
    return null;
  }
  const counts = { productsTyped: 0, productsOther: 0, typeRequestsFailed: 0 };
  let firstError: string | undefined;
  let limited = false;
  try {
    const sqlite = db.$client;
    const rows = sqlite
      .prepare(
        `SELECT code, name, manufacturer, unit_qty AS unitQty, is_weighted AS isWeighted, product_type AS productType FROM products p
         WHERE ${full ? "1" : "product_type IS NULL"} AND EXISTS (SELECT 1 FROM prices WHERE prices.code = p.code)`,
      )
      .all() as Row[];
    const byName = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.name.trim().replace(/\s+/g, " ");
      (byName.get(key) ?? byName.set(key, []).get(key)!).push(r);
    }
    const names = [...byName.entries()].slice(0, full ? undefined : MAX_NAMES);
    const save = sqlite.prepare("UPDATE products SET product_type = ?, name = COALESCE(?, name) WHERE code = ?");
    for (let i = 0; i < names.length && !signal?.aborted; i += BATCH) {
      const batch = names.slice(i, i + BATCH);
      const entries = batch.map(([sent, same]) => {
        const needType = same.filter((p) => !p.productType || p.productType === "other");
        return { sent, same, needType, typed: needType.length ? undefined : same[0]!.productType! };
      });
      const products = entries.map(({ sent, same, typed }): ProductToClassify => {
        const p = same[0]!;
        const size = measureOf(p);
        return { name: sent, manufacturer: p.manufacturer || null, size: size && `${+size.size.toFixed(3)} ${size.measure}`, soldBy: soldByOf(p), ...(typed && { type: typed }) };
      });
      const answers = await classifier.classify(products, signal).catch((e: unknown) => {
        if (signal?.aborted) return null; // the sync was stopped, not a failed request; the loop ends below
        counts.typeRequestsFailed++;
        firstError ??= e instanceof Error ? e.message : String(e);
        console.error(`product types: request ${i / BATCH + 1} failed`, e);
        if (e instanceof RateLimitError) limited = true;
        return null;
      });
      if (limited) break; // every further request would hit the limit too
      if (!answers) continue;
      sqlite.transaction(() => {
        for (const [j, { sent, same, needType, typed }] of entries.entries()) {
          const answer = answers[j];
          const type = typed ?? answer?.type;
          if (!type) continue;
          const fullName = answer!.name && numbers(answer!.name) === numbers(sent) ? answer!.name : null;
          for (const p of same) save.run(needType.includes(p) ? type : p.productType, fullName, p.code);
          if (typed) continue;
          counts.productsTyped += needType.length;
          if (type === "other") counts.productsOther += needType.length;
        }
      })();
    }
    console.log(`product types: ${byName.size} untyped names, ${names.length} sent`, counts);
  } catch (e) {
    console.error("product types: step failed", e);
    errorHandler.report(e);
  }
  if (counts.typeRequestsFailed)
    errorHandler.warn(`product types: ${counts.typeRequestsFailed} classifier requests failed`, { ...counts, error: firstError });
  return counts;
}
