// How the pages write times, prices, sizes and how a Product is sold.
export const shekels = (n: number) => `₪${n.toFixed(2)}`;
/** "500 g", "1 l", "12 pcs"; "—" when the name gives no size. */
export const size = (p: { measure: string | null; size: number | null }) => (p.measure ? `${p.size} ${p.measure === "unit" ? "pcs" : p.measure}` : "—");
export const SOLD_BY = { weight: "By weight", unit: "By the unit" } as const;

// Price syncs run on Israel time (SYNC_TIMES), so the dashboard shows it whatever the browser's zone.
const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", dateStyle: "medium", timeStyle: "short" });
export const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");
