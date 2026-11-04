import { Taps, type TapName } from "@/lib/analytics";
import type { StringKey } from "@/lib/strings";

export type DrawerEntryKey = "home" | "list" | "compare" | "share" | "recent" | "items" | "settings";
export type DrawerEntry = { key: DrawerEntryKey; label: StringKey; tap: TapName; href: "/" | "/list" | "/compare" | "/share" | "/recent" | "/items" | "/settings" };
export type DrawerSection = { key: "shopping" | "lists" | "account"; title: StringKey; entries: DrawerEntry[] };

/** Promotions joins Shopping with its own ticket. */
export const DRAWER_SECTIONS: DrawerSection[] = [
  {
    key: "shopping",
    title: "drawer.shopping",
    entries: [
      { key: "home", label: "tabs.home", tap: Taps.drawerHome, href: "/" },
      { key: "list", label: "tabs.list", tap: Taps.drawerList, href: "/list" },
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

/** The entry whose page is showing; Share list and Recently bought sit on top of a page, so none is current there. */
export function currentEntry(pathname: string): DrawerEntryKey | null {
  const page = /^\/(type|group)\//.test(pathname) ? "/" : pathname; // pages pushed inside the Home tab are Home
  const entry = DRAWER_SECTIONS.flatMap((s) => s.entries).find((e) => e.href === page);
  return entry && entry.key !== "share" && entry.key !== "recent" ? entry.key : null;
}
