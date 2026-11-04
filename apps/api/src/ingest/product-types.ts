// The Product type step of a Price sync (CONTEXT.md "Product type", docs/adr/0003).
import type { Deps } from "#/deps.ts";
import { measureOf, soldByOf } from "#/prices/groups.ts";
import type { ProductToClassify } from "#/services/classifier.ts";

const BATCH = 100;
/** Distinct names classified per Price sync; the rest wait for the next. */
export const MAX_NAMES = 5000;

type Untyped = { code: string; name: string; manufacturer: string | null; unitQty: string | null; isWeighted: number };

/**
 * Gives a Product type to the untyped Products that have a current price: each distinct name once (trimmed, spaces
 * folded), in batches, up to MAX_NAMES names, saving each answer on every such Product of that name. Never throws:
 * a failed request or an answer outside the list leaves its Products untyped for the next sync. Null when skipped.
 */
export async function typeProducts({ db, classifier, errorHandler }: Deps, signal?: AbortSignal) {
  if (!classifier) {
    console.log("product types: skipped, LLM_BASE_URL, LLM_API_KEY and LLM_MODEL are not all set");
    return null;
  }
  const counts = { productsTyped: 0, productsOther: 0, typeRequestsFailed: 0 };
  try {
    const sqlite = db.$client;
    const rows = sqlite
      .prepare(
        `SELECT code, name, manufacturer, unit_qty AS unitQty, is_weighted AS isWeighted FROM products p
         WHERE product_type IS NULL AND EXISTS (SELECT 1 FROM prices WHERE prices.code = p.code)`,
      )
      .all() as Untyped[];
    const byName = new Map<string, Untyped[]>();
    for (const r of rows) {
      const key = r.name.trim().replace(/\s+/g, " ");
      (byName.get(key) ?? byName.set(key, []).get(key)!).push(r);
    }
    const names = [...byName.entries()].slice(0, MAX_NAMES);
    const save = sqlite.prepare("UPDATE products SET product_type = ? WHERE code = ?");
    for (let i = 0; i < names.length && !signal?.aborted; i += BATCH) {
      const batch = names.slice(i, i + BATCH);
      const products = batch.map(([name, [p]]): ProductToClassify => {
        const size = measureOf(p!);
        return { name, manufacturer: p!.manufacturer || null, size: size && `${+size.size.toFixed(3)} ${size.measure}`, soldBy: soldByOf(p!) };
      });
      const answers = await classifier.classify(products).catch((e: unknown) => {
        counts.typeRequestsFailed++;
        console.error(`product types: request ${i / BATCH + 1} failed`, e);
        return null;
      });
      if (!answers) continue;
      sqlite.transaction(() => {
        for (const [j, [, same]] of batch.entries()) {
          const type = answers[j];
          if (!type) continue;
          for (const p of same) save.run(type, p.code);
          counts.productsTyped += same.length;
          if (type === "other") counts.productsOther += same.length;
        }
      })();
    }
    console.log(`product types: ${byName.size} untyped names, ${names.length} sent`, counts);
  } catch (e) {
    console.error("product types: step failed", e);
    errorHandler.report(e);
  }
  if (counts.typeRequestsFailed) errorHandler.warn(`product types: ${counts.typeRequestsFailed} classifier requests failed`, counts);
  return counts;
}
