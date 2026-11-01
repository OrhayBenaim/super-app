// Pure list logic (no React Native) so vitest can cover it.
export type CategoryGroup<T> = { category: string; count: number; items: T[] };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Groups by category in `categoryOrder` (most-used first); unknown categories go last, alphabetically. Items sorted by name. */
export function groupByCategory<T extends { name: string; category: string }>(items: T[], categoryOrder: string[]): CategoryGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  const rank = (c: string) => {
    const i = categoryOrder.indexOf(c);
    return i === -1 ? Infinity : i;
  };
  return [...groups.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((category) => {
      const list = groups.get(category)!.sort(byName);
      return { category, count: list.length, items: list };
    });
}

/** "Recently bought" window on the List. */
export const RECENT_MS = 24 * 60 * 60 * 1000;

/** The last `n` items taken off the list (not missing), newest first; with `sinceMs`, only those updated since then. */
export function recentlyBought<T extends { missing: boolean; updatedAt: string }>(items: T[], n = 5, sinceMs?: number): T[] {
  return items
    .filter((i) => !i.missing && (sinceMs === undefined || Date.parse(i.updatedAt) >= sinceMs))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, n);
}

/** Up to two initials for an avatar. */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? "")
    .join("");
