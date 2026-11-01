const FINALS: Record<string, string> = { "ם": "מ", "ן": "נ", "ך": "כ", "ף": "פ", "ץ": "צ" };
const norm = (s: string) => s.trim().toLocaleLowerCase();
// Hebrew final letters fold to their base form for the exact check, so typing "לחמ" doesn't offer a duplicate of "לחם".
const fold = (s: string) => norm(s).replace(/[םןךףץ]/g, (c) => FINALS[c]);

/**
 * Category suggestions for the add-item field: prefix matches (case-insensitive) in the given
 * order (most-used first), plus `create` = the typed text when no category matches it exactly.
 */
export function suggestCategories(input: string, categories: string[], limit = 5): { matches: string[]; create: string | null } {
  const q = norm(input);
  const matches = categories.filter((c) => norm(c).startsWith(q)).slice(0, limit);
  const exact = categories.some((c) => fold(c) === fold(input));
  return { matches, create: q && !exact ? input.trim() : null };
}

/** Add-field suggestions: items whose name starts with the input (deduped by name), plus `create` when no item has exactly that name. */
export function suggestItems<T extends { name: string }>(input: string, items: T[], limit = 5): { matches: T[]; create: string | null } {
  const byName = new Map<string, T>();
  for (const i of items) if (!byName.has(i.name)) byName.set(i.name, i);
  const { matches, create } = suggestCategories(input, [...byName.keys()], limit);
  return { matches: norm(input) ? matches.map((n) => byName.get(n)!) : [], create };
}
