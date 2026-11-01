# Sal (Grocer) — Mobile design spec

> **Figma:** https://www.figma.com/design/YncE254fQ7DyfktwvCsqR0/ — **built 2026-11-01; screens and components converted to Hebrew/RTL 2026-11-01.** Pages: **Tokens** (48 colour styles `light/*` + `dark/*` with swatch boards, 10 `type/*` text styles in Inter as a stand-in for SF/Roboto, 3 `shadow/*` effect styles, spacing/radius/spring/swipe notes) · **Components** (Button 3 variants × default/disabled, Chip ×3 tones, CategoryHeader open/collapsed, ListRow/SwipeRow default/checked/mid-swipe-check (armed 35%)/mid-swipe-delete, SortControl, StoreCard with Best-price badge, TextField, MissingToggle on/off, Sheet) · **Screens** 393×852, all in Hebrew/RTL (Onboarding 1–3, Auth, Shopping List with tab bar, My Items + Add Item sheet open, Compare, Share modal, Settings, Notification → Waze handoff). Gaps: light mode only on screens (dark exists as styles); empty/loading/error states not drawn; tab bar only on Shopping List; not variables (paint/text styles only).
>
> Source of truth for values: `docs/design/tokens.json` (loaded by `apps/mobile/src/theme/tokens.ts`). This document describes the app **as built** in `apps/mobile`, and why. Where the code and good practice disagree, see [Recommended follow-ups](#recommended-follow-ups); code was not changed.

Skill references used throughout: **[EMIL]** emil-design-eng, **[APPLE]** apple-design (WWDC "Designing Fluid Interfaces"), **[EXPO]** animate-expo. URLs are listed in [Design decisions & evidence](#design-decisions--evidence).

---

## 1. Brand direction & tone

- **What it is:** a calm household utility for Israel: one shared list, a catalog of "things we buy", the cheapest supermarket for the whole basket (government price-transparency data), and a nudge with Waze when you pass that store.
- **Personality:** *fresh, frugal, quietly confident.* Green = fresh produce and "go"; a warm burnt-orange accent is reserved for the money moment (Best price). No mascots, no confetti; delight is spent only in rare moments [EMIL frequency table].
- **Voice:** short, second-person, plain. Hebrew is the primary locale (gender-neutral plural forms: "סמנו", "קבלו"), English mirrors it. Errors say what to do next ("That code didn't work. Check it and try again."). Emoji only once, in the "Nothing missing 🎉" success empty state.
- **Restraint:** one primary action per screen, flat surfaces on a tinted background, shadows only on floating things (FAB, segmented pill, store cards) [APPLE §16 Simplicity, Craft].

## 2. Color system

Two themes, chosen by the OS (`useColorScheme`) — no in-app override. All tokens resolve via `useTheme().colors`.

| Token | Light | Dark | Role |
|---|---|---|---|
| `bg` | #F5F6F3 | #0D110F | Screen background (warm-green tinted grey, not pure white, so white cards read as raised) |
| `surface` | #FFFFFF | #161B19 | Grouped list cards, rows, tab bar, input fill |
| `surfaceRaised` | #FFFFFF | #1E2421 | Sheets, segmented-control pill, onboarding motif cards |
| `surfaceSunken` | #ECEEEA | #0A0D0C | Segmented track, neutral chips, toggle "off" track, coverage track |
| `scrim` | 40% #0D110F | 55% black | Behind the bottom sheet (dims to focus [APPLE §12]) |
| `text` / `textSecondary` / `textTertiary` | #151917 / #56605A / #69716C | #ECF1EE / #A4AEA8 / #89928D | Primary, supporting, meta/placeholder |
| `textChecked` | #69716C | #89928D | Struck-through bought item (still AA, so it stays readable) |
| `border` / `borderControl` | #DCE1DD / #8A938E | #2B3330 / #5E6863 | Hairline dividers / input & checkbox outlines (≥3:1 non-text) |
| `primary` / `primaryPressed` / `onPrimary` | #1E7148 / #175C3A / #FFF | #4BC189 / #3AA674 / #05261A | Primary button, checked circle, links, toggle on |
| `primarySoft` / `onPrimarySoft` | #E2F1E8 / #14543A | #173528 / #9BE3BF | Secondary button, tab pill, selected chips, invite-code panel, avatars |
| `accent` / `accentSoft` / `onAccentSoft` | #B23F0B / #FDEBDD / #B23F0B | #FF9A5C / #3A2214 / #FF9A5C | **Best price** badge only (+ onboarding pin); also the form-error banner fill |
| `danger` | #B42318 | #FF7A6B | Delete icon, swipe-to-delete background, field errors |
| `warning` | #93560A | #F2B65A | Partial coverage ("Has 7 of 9") and its bar |
| `swipeCheckBg` | #1E7148 | #2E8F60 | Swipe-to-check background |
| `skeleton` | #E6E9E5 | #232A27 | Loading blocks |
| `waze` / `onWaze` | #33CCFF / #0B2A36 | same | Waze button (brand-recognisable, not our primary) |

Dark mode is not inverted light: surfaces step *up* in lightness with elevation (bg → surface → surfaceRaised), and primary is lifted to #4BC189 so it keeps contrast on near-black [APPLE §16 Craft: "colors that adapt to light/dark"].

### WCAG AA check (computed, sRGB relative luminance)

AA = 4.5:1 for text, 3:1 for large text (≥ 18.66 px bold / 24 px) and UI graphics.

| Pair (fg on bg) | Light | Dark | Result |
|---|---|---|---|
| text / bg | 16.36 | 16.65 | AAA |
| text / surface | 17.75 | 15.26 | AAA |
| textSecondary / surface | 6.53 | 7.63 | AA |
| textSecondary / surfaceSunken (chips, segments) | 5.59 | 8.55 | AA |
| textTertiary / bg | 4.63 | 5.94 | AA (light is the tightest pair in the system) |
| textTertiary (= textChecked) / surface | 5.02 | 5.44 | AA |
| onPrimary / primary (buttons) | 5.98 | 7.15 | AA |
| primary / surface (links, ghost buttons) | 5.98 | 7.71 | AA |
| primary / primarySoft | 5.12 | 5.89 | AA |
| onPrimarySoft / primarySoft (secondary button, tab label) | 7.62 | 8.97 | AAA |
| onAccentSoft / accentSoft (Best price badge, 12 px semibold) | 5.02 | 7.07 | AA |
| danger / surface | 6.57 | 6.85 | AA |
| danger / accentSoft (form error banner) | 5.67 | 5.81 | AA |
| warning / surface | 5.87 | 9.64 | AA |
| onWaze / waze | 8.02 | 8.02 | AAA |
| borderControl / surface (input & checkbox outline) | 3.16 | 3.02 | ≥3:1 non-text ✓ (dark is borderline) |
| onPrimary icon / swipeCheckBg | 5.98 | 4.02 | ≥3:1 graphic ✓ |
| onPrimary icon / danger (swipe delete) | 6.57 | 6.35 | ≥3:1 graphic ✓ |

Disabled buttons drop to 50% opacity; WCAG exempts disabled controls from contrast rules.

## 3. Typography

System fonts only (`System` = SF Pro on iOS, `sans-serif` = Roboto on Android). Reasons: SF ships optical sizes and size-specific tracking; both system fonts have first-class **Hebrew** glyphs with correct metrics; zero bundle cost; Dynamic Type works out of the box [APPLE §15 "Default to the platform's system font"; HIG Typography].

The scale is the iOS Dynamic Type "Large" default scale; tracking is per size (negative for 17 pt and smaller UI sizes, positive for display sizes, per Apple's SF tracking table) — never one value for all sizes [APPLE §15].

| Variant | Size / line | Tracking | Weight | Used for |
|---|---|---|---|---|
| largeTitle | 34 / 41 | +0.37 | Bold | Screen titles (list name, My items, Compare, Settings) |
| title1 | 28 / 34 | +0.36 | Bold | Onboarding titles, Share header, **basket total ₪** |
| title2 | 22 / 28 | +0.35 | Bold | Empty-state titles |
| title3 | 20 / 25 | +0.38 | Semibold | Sheet title, Compare state titles |
| headline | 17 / 22 | −0.41 | Semibold | Button labels, store chain name |
| body | 17 / 22 | −0.41 | Regular | Row text, inputs |
| callout | 16 / 21 | −0.32 | Regular | Empty-state body, suggestions |
| subhead | 15 / 20 | −0.24 | Regular (600 for category headers) | Field labels, category headers, segments |
| footnote | 13 / 18 | −0.08 | Regular | Meta, errors, counts |
| caption | 12 / 16 | 0 | Regular (600 badge) | Tab labels, badge |

- **Prices and counts** use `fontVariant: tabular-nums` (`Text tabular`, `font.variant.price`) so totals don't jitter when sorting or updating.
- Invite code is a one-off display style: 40/48, letter-spacing 4, tabular, `selectable`.
- Font scaling is left on (RN default); layouts use `minHeight`, never fixed heights, for text containers.

## 4. Spacing, radius, elevation, hit targets

- **Spacing** `space[i]` = 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Screen gutter `space[5]`=16; row padding 16; card padding `space[6]`=20; section gaps 24–32.
- **Radius:** xs 6 (skeleton), sm 10 (segmented control, error banner), md 14 (buttons, inputs), lg 20 (grouped cards, store cards), xl 28 (sheet top), full (chips, avatars, FAB, pills). Nested radii follow `outer − padding` (segment pill = sm − 2).
- **Elevation:** `none`, `sm` (store card, segment pill, toggle thumb), `md` (FAB, onboarding cards), `lg` (reserved). Shadows are tinted #0D110F, not black. In dark mode shadows are nearly invisible by design; separation comes from surface lightness steps.
- **Hit targets:** `hitSlop.min` 44 (iOS) / `minAndroid` 48. IconButton is a 44 square; Chip clear button is 14 px visual + `hitSlop 15` = 44; radius chips 32 + `hitSlop 6` = 44 [EXPO §7].

## 5. Iconography

`lucide-react-native`, 1.5–2 px stroke default, 2.5–3 for small glyphs on colour (check marks, FAB plus). Sizes: 14 (chips), 16–18 (inline chevrons, put-back), 20 (button icon), 22 (tab, icon buttons, Waze), 24 (swipe), 36 (state illustrations). Colour always comes from a token. Map: ListChecks (list tab), ShoppingBasket (My items / empty basket), ChartColumn (Compare), Settings, Check, RotateCcw (put back), Share2, Trash2, Plus, Barcode (matched product), Navigation (Waze), ShoppingCart (order), MapPin, SearchX, TriangleAlert, Copy, UserPlus, LogOut, X, Eye/EyeOff. Directional icons (ChevronRight) are flipped with `scaleX: -1` in RTL.

## 6. Component inventory (as built)

| Component | File | Purpose | States |
|---|---|---|---|
| **Tap** | `src/ui/Tap.tsx` | Base pressable: scale on press-*in* (default 0.97, `snappy` spring), `pressRetentionOffset 16`, role button | rest, pressed (scaleTo), disabled; reduced motion → no scale |
| **Button** | `src/ui/Button.tsx` | 52 px, radius md, headline label, optional icon. Variants **primary** (primary/onPrimary), **secondary** (primarySoft/onPrimarySoft), **ghost** (transparent/primary) | rest, pressed, disabled (50%), loading (label kept laid out at opacity 0 + spinner, so width never changes) |
| **Text** | `src/ui/Text.tsx` | Type-scale variant + colour token + `tabular`; sets `writingDirection` from RTL | — |
| **TextField** | `src/ui/TextField.tsx` | Label above, 52 px field, 1.5 px border; password eye toggle | rest (borderControl), focused (primary), error (danger + footnote message, live region); border colour transitions 150 ms |
| **Screen** | `src/ui/Screen.tsx` | SafeArea + bg + 16 gutter; optional scroll / keyboard avoiding | — |
| **IconButton** | `src/ui/IconButton.tsx` | 44 square icon, scaleTo 0.9, label required | rest, pressed |
| **Divider** | `src/ui/Divider.tsx` | Hairline `border`; inset `marginStart` to align with row text | — |
| **Chip** | `src/ui/Chip.tsx` | Pill label, tones neutral/primary/accent, optional icon and clear (X) | static, clearable |
| **CategoryHeader** | `src/ui/CategoryHeader.tsx` | Subhead-600 title + tabular count; with `onToggle` becomes a button with rotating chevron | static, open, collapsed (chevron −90°, +90° in RTL) |
| **EmptyState** | `src/ui/EmptyState.tsx` | Centered title2 + callout + secondary CTA | — |
| **SwipeRow** | `src/ui/SwipeRow.tsx` | Swipe-to-commit row (check on the list, delete in My items); a11y action does the same | rest, dragging (bg fades in over first 24 px, icon 60% @ scale 0.6), **armed** (≥35%: icon 100% @ scale 1, bouncy), rubber-band past 60%, release → spring home |
| **Sheet** / **SheetTextField** | `src/ui/Sheet.tsx` | Content-sized gorhom modal sheet, radius xl, scrim backdrop, pan-down to close, keyboard-interactive; field twin built on `BottomSheetTextInput` | closed, open, keyboard up |
| **StoreCard** | `features/compare/StoreCard.tsx` | Chain + branch · distance, total ₪ (title1 tabular), coverage text + bar, show/hide missing, Order online + Waze | best (accent badge), full / partial coverage (warning), missing expanded, no online shop (disabled + caption), copied hint (4 s) |
| **StoreCardSkeleton** | `features/compare/Skeleton.tsx` | Same geometry as StoreCard, pulsing blocks, hidden from a11y | loading |
| **SortControl** | `features/compare/SortControl.tsx` | 3-segment control Price / Distance / Coverage; raised pill slides | selected (text, 600), unselected (textSecondary) |
| **RadiusChips** | `features/compare/RadiusChips.tsx` | Single-select km chips (from `RADII`) | selected (primarySoft), unselected (surface + border) |
| **MissingToggle** | `features/items/MissingToggle.tsx` | 52×32 custom switch, "on = on the shopping list"; thumb bulges 8% mid-travel | off (surfaceSunken/borderControl), on (primary) |
| **TabBar** | `features/tabs/TabBar.tsx` | Custom JS tab bar, 4 tabs, primarySoft pill behind the focused icon | focused (onPrimarySoft, icon ×1.1), unfocused (textSecondary) |
| **Avatar / Avatars** | `features/lists/Avatars.tsx` | Initials in primarySoft circle, 2 px bg ring; stack overlaps −10, max 3 | 32 (header) / 40 (share list) |
| ItemSheet, SuggestionRow | `features/items/ItemSheet.tsx` | Add/edit form inside Sheet (see §9) | add (rapid entry), edit (Save + delete) |
| Illustration | `features/onboarding/Illustration.tsx` | Pure-View parallax stage: gradient blob, 3 motifs (list, bars, pin+Waze), sparkles | per page |

## 7. Motion spec

Gate first [EMIL/EXPO "Should this animate at all?"]: tab content switches **do not** animate (`expo-router` Tabs default, no slide); list scroll and keyboard are platform-native. Everything finger-driven uses springs on the UI thread (Reanimated 4 + Gesture Handler, `scheduleOnRN` only on gesture end) [EXPO §5–6]. Everything else uses short timing or Reanimated CSS transitions.

### Springs (`tokens.motion.spring`, consumed as damping/stiffness/mass)

| Spring | ζ / response | Used for | Why |
|---|---|---|---|
| **snappy** | 1.0 / 0.30 s | Tap press scale in/out; SwipeRow return-home (with release velocity); ShoppingRow check pulse; TabBar pill + icon; SortControl pill; Compare card reorder (`LinearTransition.springify`); onboarding CTA width change | Critically damped default for UI: fast, no overshoot [APPLE §4 "start most UI at damping 1.0"] |
| **gentle** | 1.0 / 0.45 s | Sign-in ⇄ Sign-up layout reflow | Larger, calmer reflow of a whole form; still no overshoot |
| **bouncy** | 0.75 / 0.40 s | SwipeRow icon arming; MissingToggle thumb; Best price badge entrance | Bounce only where there is momentum or a reward [APPLE §4; EMIL "keep bounce subtle"] |
| **sheet** | 0.85 / 0.35 s | Bottom sheet present/dismiss (gorhom `animationConfigs`) | Apple's drawer values (0.8 / 0.3) slightly softened [APPLE §4 table] |

### Durations & easing

| Token | ms | Used for |
|---|---|---|
| press | 120 | Reference value for press feedback (Tap uses `snappy`, which settles in ≈ this time) |
| fast | 150 | TextField border colour, check-circle fill, Skip fade-out, badge opacity, "copied" fade, My items row exit |
| base | 200 | Category chevron rotation, list item fade/layout (`LinearTransition.duration(200)`, `FadeIn/Out 200`), missing-items reveal, added-chip fade |
| slow | 280 | Coverage bar fill (once, `easing.out`) |
| reflowDelay | 450 | Delay between a check and the row leaving the list, so the strike-through registers |
| toast | 4000 | "List copied — paste it in the shop's search" hint |

Easing (`tokens.motion.easing`): **out** `cubic-bezier(.23,1,.32,1)` for enter/exit; **inOut** `(.77,0,.175,1)` for on-screen moves; **sheet** `(.32,.72,0,1)` iOS drawer curve [EMIL custom curves]. No `ease-in` anywhere. All UI timing ≤ 280 ms [EMIL "stay under 300ms"].

Scales: `press 0.97` (buttons), `rowCheck 0.98` (row pulse), `enterFrom 0.95`; IconButton 0.9, FAB 0.92, chip X 0.85, rows 0.98. Never from scale(0) — the badge enters from 0.8 [EMIL].

### Swipe commit rule (`tokens.motion.swipe`)

1. Pan activates only after **10 px horizontal** (`activeOffsetX`) and fails on **8 px vertical** (`failOffsetY`) so vertical scroll always wins ambiguity [APPLE §10 hysteresis].
2. Row tracks the finger 1:1, only in the commit direction (clamped at 0 the other way).
3. Past **60 %** of row width (`maxFraction`) movement is rubber-banded: `o·d·0.55 / (d + 0.55·|o|)` [APPLE §9].
4. **Commit if** travel ≥ **35 %** of width (`commitFraction`, "armed") **or** release velocity in the commit direction > **800 px/s** (`commitVelocity`) — a flick is enough [EMIL momentum dismissal].
5. On release the row always springs home with `snappy` + the finger's velocity (velocity handoff [APPLE §5]); the commit is the side effect: the list row then leaves via layout animation, the delete row asks to confirm.
6. Direction is logical: "start"/"end" mapped to a screen sign with `I18nManager.isRTL`. List = swipe toward start (left in LTR, right in Hebrew) to check; My items = toward end to delete.

### Reduced motion (`useReducedMotion`)

Fewer and gentler, not zero [APPLE §14, EXPO §9]: Tap press scale off; TabBar/SortControl pills jump; toggle thumb jumps; chevron rotation 0 ms; check pulse off; SwipeRow arming keeps the opacity step but drops the bouncy scale; onboarding parallax translation off (crossfade + dot colour kept); coverage bar set instantly; skeleton becomes static; onboarding Next scrolls without animation. Reanimated layout animations (`FadeIn`, `LinearTransition`) follow the system setting by default. Gap: the sheet spring is not reduced (see follow-ups).

## 8. Haptics map (`expo-haptics`)

Fire on the causal frame, always paired with a visual, never per frame [APPLE §13, EXPO §8, HIG Playing haptics].

| Moment | Call |
|---|---|
| Item checked (tap or swipe commit) | `notificationAsync(Success)` |
| Put back from "Recently bought" | `selectionAsync()` |
| MissingToggle flip | `selectionAsync()` |
| Tab change (not re-tap) | `selectionAsync()` |
| Sort segment / radius chip change | `selectionAsync()` |
| Any `Button` press | `impactAsync(Light)` (see follow-up #2) |
| Long-press to edit an item | `impactAsync(Light)` |
| Delete confirmed in My items | `impactAsync(Medium)` |
| Sign-in validation failed | `notificationAsync(Error)` |
| Invite link copied | `notificationAsync(Success)` |
| Swipe crosses the commit threshold | *none today* (follow-up #1) |

## 9. Screens

Navigation: root Stack with `Stack.Protected` swapping `(auth)` ⇄ `(tabs)` on session; `share` is a native `presentation: "modal"`; 4 tabs: Shopping list · My items · Compare · Settings. Screen transitions are platform defaults [EXPO "never hand-roll"].

**Onboarding 1–3** (`app/(auth)/onboarding.tsx`). Horizontal pager (forced LTR, slides reversed in RTL). Top-end ghost **Skip** (fades out on the last page). Illustration stage ≈ 48 % of height: 1 "One list, shared / רשימה אחת, משותפת" — list card with two avatars; 2 "Cheapest basket near you / הסל הזול ביותר לידך" — three bars, the shortest green with an accent tag; 3 "Go when it's worth it / יוצאים כשזה משתלם" — accent pin, radius rings, Waze-blue pill. Bottom row: page dots (active 24 px wide, primary) + primary **Next → Get started** (width reflows with snappy). No loading/error states.

**Auth** (`sign-in.tsx`). largeTitle "Welcome back / ברוכים השבים" + subtitle; native Apple button (black/white per theme) + Google (ghost on iOS; order swapped on Android); "or" divider; Email, Password (eye toggle); Name appears for sign-up (FadeIn 200, layout gentle). States: per-field inline errors + Error haptic; server error banner (accentSoft + danger, `role=alert`); busy (spinner in the pressed button, others disabled); mode switch link.

**Shopping list** (`features/lists/ShoppingList.tsx`, tab 1). largeTitle = list name; top-end avatars stack + Share icon → Share modal. Missing items grouped by user category (`CategoryHeader` + count) in radius-lg white cards; row = 56 px check circle area + item name (2 lines). Tap circle or swipe toward start to check → circle fills (150 ms), strike-through + textChecked, row pulses 0.98, Success haptic, after 450 ms the row fades out and siblings glide up. "Recently bought" collapsible section with put-back rows (RotateCcw). Pull to refresh (own flag; 5 s polling never shows the spinner). States: loading = centered spinner; **empty** "Your list is empty" → Go to My items; **done** "Nothing missing 🎉".

**My items + Add Item sheet** (`features/items/MyItems.tsx`, `ItemSheet.tsx`, tab 2). largeTitle, search field, collapsible categories; row = name + category chip (+ "Matched" barcode chip) + MissingToggle. Long-press edits; swipe toward end deletes (confirm alert). FAB 56 px bottom-end, shadow md. **Sheet:** "Add item / הוספת מוצר"; Name ("e.g. Milk 3% / למשל: חלב 3%"), Category with autocomplete menu (+ "Create “X”"), "Match a product (optional)" search showing up to 4 products (`manufacturer · from ₪x · n stores`) → becomes a clearable Barcode chip. Rapid entry: Add keeps the sheet open, clears, refocuses Name, and the added items appear as primary chips (FadeIn). Done (secondary, 1/3) + Add (primary with Plus, 2/3, loading). Edit mode: title "Edit item", trash icon, single Save. States: empty catalog → "No items yet" + "Add your first item"; no search results; product search spinner / "No products found."; mutation error → alert.

**Compare** (`features/compare/CompareScreen.tsx`, tab 3). largeTitle, summary "9 items · 7 matched to products" (tabular), link to match the unpriced ones, SortControl, RadiusChips (5 / 10 / 20 km, default 10). FlatList of StoreCards sorted client-side; cheapest gets **Best price** badge; reorder animates with snappy. States: skeleton ×3 (list loading, locating, fetching); list error / price error → TriangleAlert + Try again; no basket → "Nothing to compare yet"; location denied → MapPin + Allow location / Open Settings; location error; no stores → "No stores within 10 km" + "Search within 20 km". Order online copies the list to the clipboard, shows the 4 s hint, opens the chain's site.

**Share** (`features/share/ShareScreen.tsx`, modal). title1 list name + close X. Members card (40 px avatar, name "(you)", email, Owner chip, remove for owners). Invite: primary "Invite someone" → primarySoft panel with "Invite code" and the 40 px code, Copy link (ghost → "Copied") + Share (system sheet). "Join a list": code field (characters) + Join; error inline. Non-owners: ghost "Leave list". States: members loading spinner; confirm alerts for remove/leave.

**Settings** (tab 4). largeTitle; card "Nearby cheap-store alerts" with native Switch and explanatory footnote that changes to the denied (warning) or Expo Go note; secondary Sign out (loading).

**Notification → Waze handoff** (`features/geofence/*`, `lib/waze.ts`). A geofence around the cheapest nearby store fires a local notification: "You're near Shufersal Deal Ramat Aviv / אתם ליד …" — "Your basket is ₪212 here, cheapest nearby." Tap → app opens Waze with `navigate=yes` (iOS: `waze://` if installed, else the `https://waze.com/ul` universal link) and replaces the stack with the Shopping list, so returning from Waze lands on the list. Works from cold start; the response is cleared so it never replays. No in-app intermediate screen by design (one tap, as promised on onboarding page 3).

## 10. Animation highlights

1. **Swipe-to-check row** — 10 px / 8 px gesture hysteresis, 1:1 tracking, rubber-band past 60 %, commit at 35 % or 800 px/s, icon arms with bouncy (0.6 → 1), release springs home with snappy + finger velocity.
2. **Check pulse & reflow** — circle fill 150 ms, row scale 1 → 0.98 → 1 (snappy ×2), Success haptic, 450 ms hold, then FadeOut 200 + `LinearTransition 200` closes the gap.
3. **MissingToggle** — thumb travels with bouncy (ζ 0.75), track colour interpolated on the same value, thumb bulges `1 + 0.08·sin(πt)` mid-travel.
4. **Segmented pill & tab pill** — absolute pill `translateX` with snappy; first layout jumps instead of sliding; RTL flips the sign.
5. **Compare reorder** — `LinearTransition.springify()` with snappy so cards glide to their new rank when the sort changes.
6. **Best price badge** — custom entering: opacity 0 → 1 in 150 ms, scale 0.8 → 1 with bouncy; once per result set (delight budget).
7. **Coverage bar** — absolute, childless fill grows width 0 → ratio in 280 ms `easing.out`, once on mount (layout-safe exception [EXPO §4]).
8. **Onboarding parallax** — blob at −0.15× scroll, motif at 0.5× with crossfade and 0.95 ↔ 1 scale, sparkles at −0.7×, dots interpolate width 8 → 24 and colour; all in a UI-thread scroll handler.

Also: sheet presents with the `sheet` spring; chevron rotates 200 ms; skeleton pulses 1 ↔ 0.45 opacity every 900 ms (alternate, Reanimated CSS animation).

## 11. Accessibility & RTL

- **Roles/states:** check circle is `checkbox` with `checked`; tabs `tablist/tab` + `selected`; SortControl `tablist`; toggles `switch` + `checked`; collapsible headers `expanded`; Button sets `busy`; titles `header`.
- **Gesture alternatives:** every SwipeRow exposes an `accessibilityActions` entry ("Mark as bought" / "Delete"); check is also a tap; edit is long-press with an `accessibilityHint`.
- **Live regions:** field errors, added-items chips, "copied" hint (`polite`); auth banner `alert`.
- **Targets:** ≥ 44 pt everywhere except SortControl segments (36 pt, follow-up #5).
- **Hidden decoration:** skeletons and the illustration are hidden / `pointerEvents=none`.
- **Dynamic Type:** text sizes scale; containers use `minHeight`. Long Hebrew strings are `numberOfLines`-capped in rows (2) and titles (1).
- **RTL (Hebrew default):** layout uses `start/end`, `paddingStart/End`, `marginStart`; `Text` sets `writingDirection`; inputs set `textAlign`; translateX signs are flipped in SwipeRow, TabBar, SortControl, MissingToggle (transforms are not mirrored by RN); chevrons flip via `scaleX`; collapsed chevron points to the reading end; the onboarding pager is forced LTR with reversed slides so scroll offsets agree on iOS and Android. Numbers and `₪` amounts stay LTR inside RTL text via tabular numerals.

## 12. Design decisions & evidence

| Decision | Evidence |
|---|---|
| Springs (ζ 1.0) by default, bounce only for toggle/arming/badge | [APPLE §4]; [EMIL "avoid bounce in most UI"] |
| Press feedback on press-in, scale 0.97 | [APPLE §1 Response]; [EMIL "Buttons must feel responsive"]; [EXPO §7] |
| Swipe commits on distance **or** velocity; rubber-band | [EMIL momentum dismissal, damping at boundaries]; [APPLE §6, §9] |
| Gesture motion on UI thread, haptic/commit via `scheduleOnRN` at end | [EXPO §6] |
| Tabs don't slide; native modal for Share; platform transitions | [EXPO §1, §3] |
| UI timing ≤ 280 ms, custom ease-out, no ease-in | [EMIL duration table, easing]; Material 3 motion tokens (short/medium 50–300 ms, emphasized decelerate for enter) — https://m3.material.io/styles/motion/easing-and-duration/tokens-specs |
| Haptics short, causal, optional, consistent | Apple HIG Playing haptics — https://developer.apple.com/design/human-interface-guidelines/playing-haptics ; [APPLE §13] |
| System fonts, size-specific tracking, Dynamic Type scale | Apple HIG Typography — https://developer.apple.com/design/human-interface-guidelines/typography ; [APPLE §15] |
| Items grouped by user-defined category; check-off is the core gesture; separate catalog of "usual" items | Bring! patterns (category grouping, catalog vs. list) — https://getbring.com/blog-posts/the-best-shopping-list-app , https://screensdesign.com/apps/bring-grocery-shopping-list/ |
| Recently bought + put back as the undo, not a confirm | [APPLE §16 Agency: forgiveness over confirmation] |
| Accent colour reserved for the Best-price moment | [APPLE §16 Simplicity/hierarchy]; [EMIL delight budget for rare moments] |
| Reduced motion keeps opacity/colour, drops translate/scale | [APPLE §14]; [EXPO §9] |
| Layout-animated width only on absolute childless fills (coverage bar, tab pill) | [EXPO §4] |

## Recommended follow-ups

1. **Haptic when a swipe arms.** Add `impactAsync(Light)` via `useAnimatedReaction` on `armed` false→true in `SwipeRow` — the "drag commits" moment [EXPO §8]; today the threshold is visual only.
2. **Stop the blanket haptic in `Button`.** Light impact on every button (Next, Skip, Done, Copy…) is over-feedback [APPLE §13 Utility; HIG "use consistently"]. Make it opt-in (`haptic` prop) for commits only.
3. **Undo instead of confirm for item delete.** Swipe-delete in My items always shows an Alert; prefer instant delete + 4 s Undo toast (`duration.toast`) [APPLE §16 Agency: confirm only irreversible actions].
4. **Reduced motion for the sheet.** Pass `reduceMotion: ReduceMotion.System` (or a short fade/timing config) to the gorhom `animationConfigs` [EXPO §9].
5. **SortControl targets** are 36 pt tall with no `hitSlop`; raise to 44 (`minHeight: 40` + `hitSlop` 4) [EXPO §7, HIG 44 pt].
6. **Onboarding dots animate `width` in flow** — re-lays-out siblings every scroll frame; use an absolute active capsule or `scaleX` [EXPO §4].
7. **Token drift:** list/item layout durations are hard-coded 200/150 and the Share "Copied" timer is a literal 2000 ms (not cleared on unmount); use `motion.duration.*` / `toast` and clear timers.
8. **One switch style.** Settings uses the native `Switch`, My items the custom `MissingToggle`; pick one so the same control looks and behaves the same [APPLE §16 Familiarity]. Also consider dropping the tab icon 1.1× scale — tab switches are a 100+/day action [EMIL frequency].
