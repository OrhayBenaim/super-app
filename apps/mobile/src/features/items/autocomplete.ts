const norm = (s: string) => s.trim().toLocaleLowerCase();

/**
 * Category suggestions for the add-item field: prefix matches (case-insensitive) in the given
 * order (most-used first), plus `create` = the typed text when no category matches it exactly.
 */
export function suggestCategories(input: string, categories: string[], limit = 5): { matches: string[]; create: string | null } {
  const q = norm(input);
  const matches = categories.filter((c) => norm(c).startsWith(q)).slice(0, limit);
  const exact = categories.some((c) => norm(c) === q);
  return { matches, create: q && !exact ? input.trim() : null };
}
