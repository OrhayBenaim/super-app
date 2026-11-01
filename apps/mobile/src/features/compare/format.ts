/** Fills `{name}` placeholders in a t() string. */
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m));
export const shekels = (n: number) => `₪${n.toFixed(2)}`;
