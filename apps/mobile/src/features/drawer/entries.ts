import { Taps, type TapName } from "@/lib/analytics";
import type { StringKey } from "@/lib/strings";

export type DrawerEntryKey = "home" | "list" | "promotions" | "compare" | "share" | "recent" | "items" | "settings";
export type DrawerEntry = { key: DrawerEntryKey; label: StringKey; tap: TapName; href: "/" | "/list" | "/promotions" | "/compare" | "/share" | "/recent" | "/items" | "/settings" };
export type DrawerSection = { key: "shopping" | "lists" | "account"; title: StringKey; entries: DrawerEntry[] };

export const DRAWER_SECTIONS: DrawerSection[] = [
  {
    key: "shopping",
    title: "drawer.shopping",
    entries: [
      { key: "home", label: "tabs.home", tap: Taps.drawerHome, href: "/" },
      { key: "list", label: "tabs.list", tap: Taps.drawerList, href: "/list" },
      { key: "promotions", label: "tabs.promotions", tap: Taps.drawerPromotions, href: "/promotions" },
      { key: "compare", label: "tabs.compare", tap: Taps.drawerCompare, href: "/compare" },
    ],
  },
  {
    key: "lists",
    title: "drawer.lists",
    entries: [
      { key: "share", label: "drawer.share", tap: Taps.drawerShare, href: "/share" },
      { key: "recent", label: "list.recent", tap: Taps.drawerRecent, href: "/recent" },
      { key: "items", label: "tabs.items", tap: Taps.drawerItems, href: "/items" },
    ],
  },
  { key: "account", title: "drawer.account", entries: [{ key: "settings", label: "tabs.settings", tap: Taps.drawerSettings, href: "/settings" }] },
];

/** Share list and Recently bought are pushed over the current page; tabs and drawer screens switch to theirs. */
export const PUSHED: DrawerEntryKey[] = ["share", "recent"];

/** The entry whose page is showing; a PUSHED page sits on top of one, so none is current there. */
export function currentEntry(pathname: string): DrawerEntryKey | null {
  // Pages pushed inside the Home and Promotions tabs belong to their tab.
  const page = /^\/(type|group)\//.test(pathname) ? "/" : pathname.startsWith("/promotions/") ? "/promotions" : pathname;
  const entry = DRAWER_SECTIONS.flatMap((s) => s.entries).find((e) => e.href === page);
  return entry && !PUSHED.includes(entry.key) ? entry.key : null;
}
