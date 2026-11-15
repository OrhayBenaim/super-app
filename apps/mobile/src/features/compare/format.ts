/** Fills `{name}` placeholders in a t() string. */
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m));
/** "350 m" under 1 km, else "1.2 km" (units come from t()). */
export const formatDistance = (km: number, t: (k: "compare.m" | "compare.km") => string) =>
  km < 1 ? fmt(t("compare.m"), { m: Math.round(km * 1000) }) : fmt(t("compare.km"), { km: km.toFixed(1) });
/** What a screen reader says for a Navigate tap: opens the store in Waze. */
export const navigateLabel = (s: { chainName: string; storeName: string }, t: (k: "compare.navigateTo") => string) =>
  fmt(t("compare.navigateTo"), { store: `${s.chainName} ${s.storeName}` });
export const shekels = (n: number) => `₪${n.toFixed(2)}`;
