import type { ProductTypeFilter } from "@grocer/shared/product-types";

// How the pages write times, prices, sizes and how a Product is sold.
export const shekels = (n: number) => `₪${n.toFixed(2)}`;
/** "500 g", "330 ml", "1.5 l", "12 pcs"; "—" when the name gives no size. */
export function size({ measure, size }: { measure: string | null; size: number | null }) {
  if (!measure || size === null) return "—";
  if (measure === "unit") return `${size} pcs`;
  const small = size < 1;
  // Rounded to a thousandth: sizes read from names carry float noise (0.17300000000000001).
  return `${Math.round((small ? size * 1000 : size) * 1000) / 1000} ${small ? (measure === "kg" ? "g" : "ml") : measure}`;
}
export const SOLD_BY = { weight: "By weight", unit: "By the unit" } as const;
/** Product types by the names the app shows (apps/mobile strings, English). */
export const TYPE_NAMES = {
  "dairy-eggs": "Dairy & eggs", "meat-fish": "Meat & fish", produce: "Fruit & vegetables", bakery: "Bread & bakery", drinks: "Drinks",
  "snacks-sweets": "Snacks & sweets", pantry: "Pantry & cooking", frozen: "Frozen", canned: "Canned", "cleaning-home": "Cleaning & home",
  "personal-care": "Personal care", baby: "Baby", pets: "Pets", alcohol: "Alcohol", other: "Other", none: "No type yet",
} as const satisfies Record<ProductTypeFilter, string>;

/** Who a Promotion is for. */
export const AUDIENCES = { all: "Everyone", club: "Club", card: "Card", coupon: "Coupon" } as const;

// Price syncs run on Israel time (SYNC_TIMES), so the dashboard shows it whatever the browser's zone.
export const ZONE = "Asia/Jerusalem";
const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, dateStyle: "medium", timeStyle: "short" });
export const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, dateStyle: "short" });
const hourMinute = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric" });
const DAY = 86_400_000;

/** "06:41", Israel time. */
export const time = (iso: string | Date) => hourMinute.format(new Date(iso));
/** "Oct 29", Israel time. */
export const shortDate = (iso: string | Date) => monthDay.format(new Date(iso));
const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long" });
/** "Sunday", Israel time. */
export const weekday = (iso: string | Date) => weekdayName.format(new Date(iso));
/** Whether it falls on today's date, Israel time. */
export const isToday = (iso: string | Date, now: Date) => dayKey.format(new Date(iso)) === dayKey.format(now);

/** "Today 06:00", "Yesterday 20:00", else "Oct 29, 06:00". */
export function day(iso: string, now: Date) {
  const d = new Date(iso);
  // shortcut: "Yesterday" is 24 h back, so for an hour after midnight on a daylight-saving day it can name the wrong day; compare calendar days if a run is ever mislabelled.
  const label = isToday(d, now) ? "Today" :dayKey.format(d) === dayKey.format(now.getTime() - DAY) ? "Yesterday" : `${shortDate(d)},`;
  return `${label} ${time(d)}`;
}

/** A Price sync's length: "45 s", "41 min", "2 h 0 min". */
export function minutes(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** What one Chain took: "0.4 s", "45 s", "2 min 37 s", "1 h 5 min". */
export function took(ms: number) {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

const count = new Intl.NumberFormat("en-US");
/** "1,204" */
export const num = (n: number) => count.format(n);
/** "1 run", "22 runs" */
export const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;
