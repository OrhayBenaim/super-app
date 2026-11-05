// The Internal dashboard's Product groups (docs/adr/0007): the groups by Product type, one group with its members, and
// the team's edits: renaming a group, adding or removing a Product, and making, changing or deleting a Made group.
// Each edit moves the Products it touches in browse's copy (regroupProducts), so Home follows without a Price sync.
import type { ProductType } from "@grocer/shared/product-types";
import type { Db } from "#/db/index.ts";
import { productsByCode, productsMatching } from "#/db/products.ts";
import { catalog } from "#/prices/browse-data.ts";
import { regroupProducts, restyleCards } from "#/prices/browse-groups.ts";
import {
  commonest, ftsMatch, groupEdits, groupMembers, groupRef, groupsFrom, madeGroups, madeId, madeRef, measureOf, nameWords, parseRef, sameMeasure,
  soldByOf, type Measure, type Size,
} from "#/prices/groups.ts";

export type MadeGroupFields = { name: string; productType: ProductType; measure: Measure; size: number; codes: string[] };
/** Why an edit was refused: no such group or Product (404), or a Product measured another way than the group (400). */
export type Refusal = "no group" | "no product" | "other measure";

/** The group's measure, or null when the ref names no group: a Made group that is gone, or words no Product starts. */
function sizeOf(db: Db, ref: string): Size | null {
  const id = madeId(ref);
  if (id !== null) {
    const g = madeGroups(db, [id])[0];
    return g ? { measure: g.measure, size: g.size } : null;
  }
  const { members, size } = groupMembers(db, ref);
  return members.length || groupEdits(db, [ref]).has(ref) ? size : null;
}

/** The Products among `codes` that are missing or measured another way than `size`, as a refusal, or null. */
function misfit(db: Db, codes: string[], size: Size): Refusal | null {
  const found = productsByCode(db, codes);
  if (found.length < new Set(codes).size) return "no product";
  return found.every((p) => sameMeasure(measureOf(p), size)) ? null : "other measure";
}

const membersOf = (db: Db, id: number) => db.$client.prepare("SELECT code FROM group_products WHERE ref = ?").pluck().all(madeRef(id)) as string[];

/** Makes a Made group of exactly these Products; its ref, or a refusal. */
export function createMadeGroup(db: Db, { name, productType, measure, size, codes }: MadeGroupFields): { ref: string } | Refusal {
  const refused = misfit(db, codes, { measure, size });
  if (refused) return refused;
  const sqlite = db.$client;
  const ref = sqlite.transaction(() => {
    const id = sqlite.prepare("INSERT INTO made_groups (name, product_type, measure, size) VALUES (?, ?, ?, ?)").run(name, productType, measure, size).lastInsertRowid;
    const add = sqlite.prepare("INSERT OR IGNORE INTO group_products (ref, code, added) VALUES (?, ?, 1)");
    for (const code of codes) add.run(madeRef(Number(id)), code);
    return madeRef(Number(id));
  })();
  regroupProducts(db, codes);
  return { ref };
}

/** Changes a Made group's name, Product type and measure, and its Products to exactly `codes`. */
export function updateMadeGroup(db: Db, ref: string, { name, productType, measure, size, codes }: MadeGroupFields): Refusal | null {
  const id = madeId(ref);
  if (id === null || !madeGroups(db, [id]).length) return "no group";
  const refused = misfit(db, codes, { measure, size });
  if (refused) return refused;
  const sqlite = db.$client;
  const before = membersOf(db, id);
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE made_groups SET name = ?, product_type = ?, measure = ?, size = ? WHERE id = ?").run(name, productType, measure, size, id);
    sqlite.prepare("DELETE FROM group_products WHERE ref = ?").run(ref);
    const add = sqlite.prepare("INSERT OR IGNORE INTO group_products (ref, code, added) VALUES (?, ?, 1)");
    for (const code of codes) add.run(ref, code);
  })();
  restyleCards(db, ref);
  regroupProducts(db, [...new Set([...before, ...codes])]);
  return null;
}

/** Deletes a Made group; List items matched to it are left unmatched. False when there is no such group. */
export function deleteMadeGroup(db: Db, ref: string) {
  const id = madeId(ref);
  if (id === null) return false;
  const sqlite = db.$client;
  const before = membersOf(db, id);
  const { changes } = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM group_products WHERE ref = ?").run(ref);
    return sqlite.prepare("DELETE FROM made_groups WHERE id = ?").run(id);
  })();
  if (changes) regroupProducts(db, before);
  return changes > 0;
}

/** Names a group: a Made group's own name, a word group's display name. */
export function renameGroup(db: Db, ref: string, name: string): Refusal | null {
  if (!sizeOf(db, ref)) return "no group";
  const id = madeId(ref);
  if (id !== null) db.$client.prepare("UPDATE made_groups SET name = ? WHERE id = ?").run(name, id);
  else db.$client.prepare("INSERT INTO group_names (ref, name) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET name = excluded.name").run(ref, name);
  restyleCards(db, ref);
  return null;
}

/**
 * Adds a Product to a group (`added`) or removes it: stored for good, so a removed Product never re-joins the group and
 * an added one stays, whatever later Price syncs bring. An added Product must be measured the group's way.
 */
export function setMember(db: Db, ref: string, code: string, added: boolean): Refusal | null {
  const size = sizeOf(db, ref);
  if (!size) return "no group";
  if (added) {
    const refused = misfit(db, [code], size);
    if (refused) return refused;
  } else if (!productsByCode(db, [code]).length) return "no product";
  if (!added && madeId(ref) !== null) db.$client.prepare("DELETE FROM group_products WHERE ref = ? AND code = ?").run(ref, code); // no word members to keep out
  else {
    db.$client
      .prepare("INSERT INTO group_products (ref, code, added) VALUES (?, ?, ?) ON CONFLICT(ref, code) DO UPDATE SET added = excluded.added")
      .run(ref, code, added ? 1 : 0);
  }
  regroupProducts(db, [code]);
  return null;
}

/** A group's members some store prices, each with its cheapest price and store count, cheapest per kilo, liter or pack first. */
function pricedMembers(db: Db, ref: string) {
  const { members, soldBy, size } = groupMembers(db, ref);
  const priced = db.$client.prepare("SELECT min(price) AS minPrice, count(*) AS storeCount FROM prices WHERE code = ?");
  const rows = members.flatMap((p) => {
    const { minPrice, storeCount } = priced.get(p.code) as { minPrice: number | null; storeCount: number };
    return minPrice === null ? [] : [{ code: p.code, name: p.name, ...measureOf(p)!, soldBy: soldByOf(p), minPrice, storeCount }];
  });
  const per = (m: (typeof rows)[number]) => (size?.measure === "unit" ? m.minPrice : m.minPrice / m.size);
  return { members: rows.sort((a, b) => per(a) - per(b) || a.name.localeCompare(b.name)), soldBy, size };
}

type Listed = { ref: string; name: string; measure: Measure; size: number; soldBy: string; productCount: number; made: boolean; edited: boolean };

/**
 * One page of a Product type's groups, as Home groups them (browse's copy) plus the Made groups of that type, those
 * whose names hold `q` only, most Products first: each flagged `made` or `edited` by the team. `madeOrEdited` counts
 * every type's.
 */
export function groupList(db: Db, { type, q, page, pageSize }: { type: ProductType; q?: string; page: number; pageSize: number }) {
  const c = catalog(db);
  const counts = new Map<number, number>(); // per browse_groups id, its Products some store prices
  for (let k = 0; k < c.groups.length; k++) if (c.groups[k]! >= 0 && c.stores[k]) counts.set(c.groups[k]!, (counts.get(c.groups[k]!) ?? 0) + 1);
  const rows = db.$client
    .prepare("SELECT id, type, ref, name, measure, size, sold_by AS soldBy FROM browse_groups WHERE ref IS NOT NULL ORDER BY id")
    .all() as { id: number; type: string; ref: string; name: string; measure: Measure; size: number; soldBy: string }[];
  const edits = groupEdits(db);
  const byRef = new Map<string, Listed>();
  for (const { id, type: t, ...row } of rows) {
    const n = counts.get(id) ?? 0;
    if (!n || t !== type || madeId(row.ref) !== null) continue;
    const seen = byRef.get(row.ref);
    if (seen) seen.productCount += n;
    else byRef.set(row.ref, { ...row, productCount: n, made: false, edited: edits.has(row.ref) });
  }
  for (const g of madeGroups(db).filter((g) => g.type === type)) {
    const card = rows.filter((r) => r.ref === g.ref);
    const n = card.reduce((sum, r) => sum + (counts.get(r.id) ?? 0), 0);
    byRef.set(g.ref, { ref: g.ref, name: g.name, measure: g.measure, size: card[0]?.size ?? g.size, soldBy: card[0]?.soldBy ?? "unit", productCount: n, made: true, edited: false });
  }
  const needle = q?.toLowerCase();
  const found = [...byRef.values()]
    .filter((g) => !needle || g.name.toLowerCase().includes(needle))
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name, "he"));
  return { groups: found.slice((page - 1) * pageSize, page * pageSize), total: found.length, hasMore: found.length > page * pageSize, madeOrEdited: edits.size };
}

/**
 * One group: its facts (name, Product type, measure, commonest pack, Products and stores), its narrower word groups
 * (the next words 2+ of its Products share) and its members some store prices, cheapest per kilo, liter or pack first.
 * Null when the ref names no group.
 */
export function groupDetail(db: Db, ref: string) {
  const size = sizeOf(db, ref);
  if (!size) return null;
  const { members, soldBy } = pricedMembers(db, ref);
  const made = madeGroups(db, [madeId(ref) ?? 0])[0];
  const edit = groupEdits(db, [ref]).get(ref);
  const card = db.$client.prepare("SELECT type, name FROM browse_groups WHERE ref = ? ORDER BY id LIMIT 1").get(ref) as { type: ProductType; name: string } | undefined;
  const word = parseRef(ref);
  const match = word && ftsMatch(word.words);
  const found = match ? groupsFrom(word.words, productsMatching(db, match).map((p) => ({ ...p, minPrice: 0 })), { minProducts: 1, everyMeasure: true }).find((g) => g.ref === ref) : undefined;
  const narrower = (found?.refinements ?? []).flatMap((raw) => {
    const next = nameWords(raw)[0]?.norm;
    const narrowRef = next && groupRef([...word!.words, next], size);
    return narrowRef && parseRef(narrowRef) ? [{ ref: narrowRef, name: `${found!.name} ${raw}`, productCount: pricedMembers(db, narrowRef).members.length }] : [];
  });
  const { n: storeCount } = db.$client
    .prepare("SELECT count(DISTINCT store_id) AS n FROM prices WHERE code IN (SELECT value FROM json_each(?))")
    .get(JSON.stringify(members.map((m) => m.code))) as { n: number };
  return {
    group: {
      ref, name: edit?.name ?? card?.name ?? found?.name ?? word!.words.join(" "), type: made?.type ?? card?.type ?? null, measure: size.measure,
      size: size.measure === "unit" ? size.size : (commonest(members.map((m) => m.size)) ?? 1), soldBy,
      productCount: members.length, storeCount, made: !!made, edited: !made && !!edit,
    },
    narrower: narrower.filter((g) => g.productCount > 0),
    members,
  };
}
