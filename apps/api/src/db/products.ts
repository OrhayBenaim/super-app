import type { Db } from "#/db/index.ts";

/** Products whose name matches an FTS5 query over products_fts, with what a product's measure and sold-by are read from. */
export const productsMatching = (db: Db, match: string) =>
  db.$client
    .prepare("SELECT p.code, p.name, p.unit_qty AS unitQty, p.is_weighted AS isWeighted FROM products_fts f JOIN products p ON p.code = f.code WHERE products_fts MATCH ?")
    .all(match) as { code: string; name: string; unitQty: string | null; isWeighted: number }[];
