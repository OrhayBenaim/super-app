import { PostHog } from "posthog-react-native";

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;

// Without a key (dev, tests) there is no client at all, so PostHog can't take the app down; every call is a no-op.
// Session replay stays off.
const posthog = key
  ? new PostHog(key, { host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com", captureAppLifecycleEvents: true })
  : undefined;

/** Every event the app sends. */
export const Events = {
  tap: "tap",
  listItemAdded: "list_item_added",
  listItemChecked: "list_item_checked",
  compareViewed: "compare_viewed",
  compareStoreSelected: "compare_store_selected",
  geofenceTriggered: "geofence_triggered",
  notificationOpened: "notification_opened",
  itemEditOpened: "item_edit_opened",
  itemDeleted: "item_deleted",
  listShared: "list_shared",
  listJoined: "list_joined",
} as const;
export type Event = (typeof Events)[keyof typeof Events];

/** Every tracked tap: stable and language-neutral (usually the action's strings key), never user data. Add new ones here. */
export const Taps = {
  authApple: "auth.apple",
  authForgot: "auth.forgot",
  authGoogle: "auth.google",
  authHidePassword: "auth.hidePassword",
  authResetBack: "auth.reset.back",
  authResetResend: "auth.reset.resend",
  authResetSend: "auth.reset.send",
  authResetSubmit: "auth.reset.submit",
  authShowPassword: "auth.showPassword",
  authSignIn: "auth.signIn",
  authSignUp: "auth.signUp",
  authToSignIn: "auth.toSignIn",
  authToSignUp: "auth.toSignUp",
  commonBack: "common.back",
  commonCancel: "common.cancel",
  commonDone: "common.done",
  commonGetStarted: "common.getStarted",
  commonNext: "common.next",
  commonSave: "common.save",
  commonSkip: "common.skip",
  commonUndo: "common.undo",
  compareEmptyWiden: "compare.empty.widen",
  compareLocationAllow: "compare.location.allow",
  compareLocationSettings: "compare.location.settings",
  compareMissing: "compare.missing",
  compareMissingMatch: "compare.missing.match",
  compareNavigate: "compare.navigate",
  compareOrder: "compare.order",
  compareRadiusLabel: "compare.radiusLabel",
  compareRetryCompare: "compare.retry.compare",
  compareRetryList: "compare.retry.list",
  compareRetryLocation: "compare.retry.location",
  compareSortCoverage: "compare.sort.coverage",
  compareSortDistance: "compare.sort.distance",
  compareSortPrice: "compare.sort.price",
  itemsAdd: "items.add",
  itemsAddCreate: "items.add.create",
  itemsAddDismiss: "items.add.dismiss",
  itemsAddProduct: "items.add.product",
  itemsAddToList: "items.addToList",
  itemsCategory: "items.category",
  itemsCategoryNew: "items.category.new",
  itemsCategoryPick: "items.category.pick",
  itemsDelete: "items.delete",
  itemsEmptyCta: "items.empty.cta",
  itemsProduct: "items.product",
  itemsProductNoMatch: "items.product.noMatch",
  itemsProductPick: "items.product.pick",
  itemsRemoveFromList: "items.removeFromList",
  listCheapest: "list.cheapest",
  listCheck: "list.check",
  listItem: "list.item",
  listPutBack: "list.putBack",
  listRecent: "list.recent",
  listToItems: "list.toItems",
  listToList: "list.toList",
  onboardingDemoNavigate: "onboarding.demo.navigate",
  onboardingDemoOrder: "onboarding.demo.order",
  settingsDeleteAccount: "settings.deleteAccount",
  settingsNearby: "settings.nearby",
  settingsOpenSettings: "settings.openSettings",
  settingsSignOut: "settings.signOut",
  shareCopy: "share.copy",
  shareJoin: "share.join",
  shareJoinButton: "share.join.button",
  shareLeave: "share.leave",
  shareRemoveMember: "share.removeMember",
  shareSend: "share.send",
  shareTitle: "share.title",
  tabCompare: "tab.compare",
  tabIndex: "tab.index",
  tabItems: "tab.items",
  tabSettings: "tab.settings",
} as const;
export type TapName = (typeof Taps)[keyof typeof Taps];

/** Every analytics call in the app goes through this module; nothing else imports posthog-react-native. */
export const screen = (name: string) => posthog?.screen(name);
export const flush = async () => posthog?.flush();

/** Never pass names, emails or free text: the user id is the only personal data we send. */
export const track = (event: Event, properties?: Record<string, string | number | boolean>) => posthog?.capture(event, properties);

/** `Tap` sends this for every press; a raw Pressable or Switch calls it itself. */
export const trackTap = (name: TapName, properties?: Record<string, boolean>) => track(Events.tap, { name, ...properties });

/** identify() merges the anonymous pre-sign-in events into the user; reset() starts a new anonymous id. */
export function syncIdentity(previousId: string | null, userId: string | null) {
  if (userId === previousId) return;
  if (previousId) posthog?.reset();
  if (userId) posthog?.identify(userId);
}

/** Route pattern, not the URL: "/join/[code]" keeps invite codes and ids out of PostHog. */
export const screenName = (segments: string[]) => "/" + segments.filter((s) => !s.startsWith("(")).join("/");
