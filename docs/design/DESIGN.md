---
name: Grocer
description: A native iOS shopping list whose one job is the price answer, Hebrew-first.
colors:
  grouped-bg: "#F2F2F7"
  surface: "#FFFFFF"
  elevated: "#FFFFFF"
  fill-control: "#E3E3E8"
  fill-selected: "#FFFFFF"
  label-primary: "#000000"
  label-secondary: "#5F5F64"
  control-outline: "#8A8A8F"
  separator: "#C6C6C8"
  tint: "#3446D6"
  tint-soft: "#E6E8FB"
  tint-on: "#FFFFFF"
  saving: "#1A7F3C"
  warning: "#9A5800"
  danger: "#D70015"
  scrim: "rgba(0, 0, 0, 0.4)"
  grouped-bg-dark: "#000000"
  surface-dark: "#1C1C1E"
  elevated-dark: "#2C2C2E"
  fill-control-dark: "#2C2C2E"
  fill-selected-dark: "#636366"
  label-primary-dark: "#FFFFFF"
  label-secondary-dark: "#98989F"
  control-outline-dark: "#7C7C82"
  separator-dark: "#38383A"
  tint-dark: "#8C98FF"
  tint-soft-dark: "#23284A"
  tint-on-dark: "#0A0D2B"
  saving-dark: "#4CD27A"
  warning-dark: "#FFB340"
  danger-dark: "#FF6961"
typography:
  largeTitle:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: "41px"
    letterSpacing: "0.4px"
  title2:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "28px"
  title3:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "25px"
  headline:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.4px"
  body:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "-0.4px"
  callout:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "21px"
  subhead:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
  footnote:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  caption:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  sectionHeader:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  price-hero:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: "48px"
    fontFeature: "tnum"
  price-row:
    fontFamily: "SF Pro, SF Hebrew, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "22px"
    fontFeature: "tnum"
rounded:
  control: "10px"
  group: "12px"
  button: "14px"
  sheet: "16px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "32px"
components:
  button-filled:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.tint-on}"
    typography: "{typography.headline}"
    rounded: "{rounded.button}"
    height: "50px"
  button-tinted:
    backgroundColor: "{colors.tint-soft}"
    textColor: "{colors.tint}"
    typography: "{typography.headline}"
    rounded: "{rounded.button}"
    height: "50px"
  button-plain:
    textColor: "{colors.tint}"
    typography: "{typography.headline}"
    rounded: "{rounded.button}"
    height: "50px"
  button-destructive:
    textColor: "{colors.danger}"
    typography: "{typography.body}"
    height: "50px"
  segmented:
    backgroundColor: "{colors.fill-control}"
    textColor: "{colors.label-primary}"
    typography: "{typography.subhead}"
    height: "32px"
  segmented-thumb:
    backgroundColor: "{colors.fill-selected}"
  search-field:
    backgroundColor: "{colors.fill-control}"
    textColor: "{colors.label-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
  inset-group:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.group}"
    padding: "0 16px"
  list-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label-primary}"
    typography: "{typography.body}"
    height: "52px"
    padding: "0 16px"
  check-row-checked:
    textColor: "{colors.label-secondary}"
  section-header:
    textColor: "{colors.label-secondary}"
    typography: "{typography.sectionHeader}"
    padding: "0 16px"
  store-row-price:
    textColor: "{colors.label-primary}"
    typography: "{typography.price-row}"
  best-store-total:
    textColor: "{colors.label-primary}"
    typography: "{typography.price-hero}"
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label-secondary}"
    typography: "{typography.caption}"
  tab-bar-selected:
    textColor: "{colors.tint}"
  sheet:
    backgroundColor: "{colors.elevated}"
    rounded: "{rounded.sheet}"
---

# Design System: Grocer

> **Status.** This file records the v2 visual world as built in Figma: https://www.figma.com/design/YncE254fQ7DyfktwvCsqR0/ (pages Foundations, Components, Screens; the v1 pages were deleted, the old look lives only in git history of this file). The Screens page is grouped into flow sections (Onboarding & sign in, List, My items, Compare, Settings & nearby alert); every frame carries a "How you get here" caption. **The code has not been migrated.** `apps/mobile/src/theme`, which loads `docs/design/tokens.json`, still implements the v1 look (green primary, burnt-orange Best-price accent, card stacks, coverage bars, custom tab bar and MissingToggle). Until a migration lands, `tokens.json` describes the running app and this file describes the target. Do not mix the two on one screen.
>
> Figma uses **Heebo** as a stand-in for SF Pro / SF Hebrew; the app uses the system font. Color and size values live as Figma variables (collections "Grocer color" with Light / Dark modes, and "Grocer size"); text styles are `v2/*`.

## Overview

**Creative North Star: "The Price Answer, Native"**

Grocer is a native iOS utility whose one job is the price answer: where the household's whole basket is cheapest nearby, and by how much. The world is standard iOS on purpose (system grouped backgrounds, inset groups, the SF type scale, standard tab bar and sheets) so that nothing about the frame needs learning in a busy supermarket. Grocer's own expression lives inside that frame, not on top of it: one ultramarine tint for everything you can press, and three state colors that each mean exactly one thing.

The system refuses the grocery category's green produce look, card stacks and coverage bars. Every screen is a grouped list with one action. Density is iOS-standard: 52pt rows, 16pt gutters, hairline separators inset to the text start. Depth is tonal, not cast: the gray grouped background sits behind white groups, and only sheets and the selected segment thumb carry a shadow. Every screen is designed right-to-left first in Hebrew; English mirrors it.

**Key Characteristics:**
- Standard iOS grouped lists, large titles, tab bar and sheets; no custom chrome.
- One tint (ultramarine) for every pressable thing; nothing else is blue.
- Green, amber and red are states, never decoration.
- Prices are tabular and visible: the best total is the largest thing on Compare.
- RTL first; layout speaks in leading / trailing, never left / right.
- Light and dark from the same variables.

## Colors

A gray-and-white iOS system ground with one saturated ultramarine and three single-purpose state colors.

### Primary
- **Ultramarine Tint** (light / dark: `tint`, `tint-dark`): every interactive element: filled and plain buttons, links, the switch "on" track, the checked circle, the selected tab, chevrons that open something, the nav-bar radius pull-down. Filled buttons put **Tint On** (`tint-on`, `tint-on-dark`) on it (7.02:1 light, 7.28:1 dark). Tint as text reads 7.02:1 on white and 6.52:1 on dark surface.
- **Tint Wash** (`tint-soft`, `tint-soft-dark`): tinted-button fill and member avatars. Never a surface for content.

### Tertiary (states)
- **Money Green** (`saving`, `saving-dark`): only the money-saved line ("₪1.20 less than Rami Levy"). 5.07:1 light, 8.76:1 dark.
- **Coverage Amber** (`warning`, `warning-dark`): only partial coverage ("priced 3 of 4 · 1 missing") and the missing count on store rows. 5.57:1 / 9.54:1.
- **Destructive Red** (`danger`, `danger-dark`): only destructive actions (sign out, delete, remove member) and blocking errors. 5.38:1 / 6.03:1.

### Neutral
- **Grouped Gray** (`grouped-bg`, `grouped-bg-dark`): screen background behind inset groups.
- **Group White** (`surface`, `surface-dark`): inset groups, rows, tab bar (at 85% with blur).
- **Sheet Surface** (`elevated`, `elevated-dark`): sheets and popovers; in dark it steps one level lighter than groups.
- **Control Fill** (`fill-control`, `fill-control-dark`): segmented track, search field, switch "off" track.
- **Selected Thumb** (`fill-selected`, `fill-selected-dark`): the selected segment.
- **Label** (`label-primary`, `label-primary-dark`): primary text and prices.
- **Secondary Label** (`label-secondary`, `label-secondary-dark`): detail lines, section headers, footers, checked items, placeholders. Holds 4.96:1 even on Control Fill (5.94:1 dark on surface).
- **Control Outline** (`control-outline`, `control-outline-dark`): empty check circle, sheet grabber, disclosure chevrons. Non-text, at least 3:1 (3.44 on white, 4.1 on dark surface).
- **Separator** (`separator`, `separator-dark`): hairlines between rows and the tab bar top edge.
- **Scrim** (`scrim`, black at 40%): behind sheets.

### Named Rules
**The One Tint Rule.** Everything pressable is the tint, and nothing that is not pressable is. If a reader cannot tap it, it is not ultramarine.

**The One Meaning Rule.** Green means money saved, amber means partial coverage, red means destructive. A state color never decorates, never marks a category, never sells.

**The Honest Coverage Rule.** Partial coverage is always shown, in amber text, next to the price it qualifies, and it opens the what's-missing sheet. It is never hidden to make a price look better.

## Typography

**Display / Body Font:** SF Pro and SF Hebrew (system font in the app; Heebo stands in inside Figma).

**Character:** The iOS Dynamic Type "Large" scale, unmodified, plus two price styles. Weight and size do the hierarchy; there is no second family and no decorative type.

### Hierarchy
- **Large Title** (Bold, 34/41, +0.4): top-level screen titles (List name, My items, Compare, Settings).
- **Title 2** (Bold, 22/28): onboarding and empty-state titles.
- **Title 3** (SemiBold, 20/25): sheet titles and the best store's chain name.
- **Headline** (SemiBold, 17/22, -0.4): button labels, emphasized row titles.
- **Body** (Regular, 17/22, -0.4): row text, field text.
- **Callout / Subhead** (16/21, 15/20): supporting copy, segment labels, row detail lines.
- **Footnote / Caption** (13/18, 12/16): group footers, tab labels.
- **Section Header** (13/18): the title and trailing count above each inset group, in Secondary Label.
- **Price Hero** (Bold, 40/48, tabular): the best store's basket total. Only one per screen.
- **Price Row** (SemiBold, 17/22, tabular): trailing prices on store rows and the "cheapest now" row.

### Named Rules
**The Tabular Price Rule.** Every price and count uses tabular figures, so totals never jitter while sorting or updating. `₪` amounts stay LTR inside RTL text.

**The Scale Not Shout Rule.** Section headers are sentence-case Secondary Label at 13pt. No uppercase labels and no eyebrow text above titles.

## Layout

Single-column iOS layout at 393pt width, designed RTL first. Screen gutters and inset-group margins are 16pt (`spacing.4`); rows are 52pt minimum (`size/row`) and every target is at least 44pt (`size/target`). Groups are separated by a section header; all spacing comes from the 4pt-based scale (4 / 8 / 12 / 16 / 20 / 24 / 32). Top-level screens open with a large title and one summary line in Secondary Label; tabs carry their own title. Sheets are content-sized, with a grabber. Containers use minimum heights, never fixed heights, so Dynamic Type can grow them.

Screen anatomy, as drawn: **List** = + / share in the nav bar → "cheapest now" summary row (no chevron, price in Tint; tapping switches to the Compare tab) → category groups of check rows → "Recently bought" row (pushes the Recently bought screen, back button "הבית"). **My items** = search field → category groups of item rows (add-to-list button at the trailing end) → footer. **Compare** = radius pull-down in the nav bar → large title + summary → segmented (price / distance / coverage) → Best store group → "Other branches" group of store rows. **Settings** = alerts group with footer → account group ending in a destructive row.

## Elevation & Depth

Flat and tonal. Depth comes from the grouped-background / surface / elevated steps (in dark: black → #1C1C1E → #2C2C2E), never from cast shadows on content. The tab bar sits at 85% surface with background blur and a top hairline.

### Shadow Vocabulary
- **Sheet** (system sheet shadow): sheets only, over the scrim.
- **Segment thumb** (the iOS segmented-control thumb shadow): the selected segment only.

### Named Rules
**The No Shadow Rule.** Nothing casts a shadow except sheets and the selected segment thumb. Groups, rows, buttons and cards are flat.

## Shapes

Continuous iOS corners in four steps: controls 10pt (search field, small fills), inset groups 12pt, buttons 14pt, sheets 16pt (top corners). Circles for the check control, switch thumb and avatars. Separators are hairlines inset to the text start on the leading side and run to the group's trailing edge. No borders around groups or buttons; the fill does the work.

## Components

All components are iOS standard in structure; Grocer's expression is color assignment and content.

### Buttons
- **Shape:** gently rounded (14pt), 50pt tall, full width inside its group.
- **Filled:** tint fill, Tint On label in Headline. One per screen, for the screen's one primary action (Navigate with Waze, Next, Sign in).
- **Tinted:** Tint Wash fill, tint label. Secondary actions that still need weight.
- **Plain:** no fill, tint label (Order online, Skip).
- **Destructive:** danger label, no fill; as a row it ends the account group.
- **Pressed / disabled:** iOS standard highlight on press; disabled at reduced opacity.

### Segmented control
- 3 segments, 32pt tall, Control Fill track, Selected Thumb with the segment shadow. Used for Compare's sort (price / distance / coverage). A 32pt control needs vertical hit slop to reach 44pt.

### Search field
- Control Fill, 10pt radius, leading magnifier in Secondary Label, Body placeholder. Sits under the large title on My items.

### Lists (inset groups)
- **Inset group:** Group White, 12pt radius, 16pt margins, no border, no shadow.
- **Section header:** Section Header text in Secondary Label with a trailing tabular count.
- **Check row:** leading check circle (Control Outline when open; tint fill with a Tint On check when checked). Checked: strike-through and Secondary Label. Tap the circle or use the leading swipe action to tick.
- **Item row:** name + optional detail "from ₪x · in N branches" in Subhead Secondary Label. Trailing end: when the item is not on the list, an add button (30pt Tint Soft circle with a Tint "+", 44pt target); when it is, nothing at the trailing end: a small static tag "ברשימה" (On the list) sits inline right after the item name (11/14 SemiBold Tint on Tint Soft, 18pt tall, radius 4, 6pt from the name), reading as status, not as a button. Tapping the row toggles. Never a switch (that is a setting) and never a check circle (on the List that means "bought"). No category chip.
- **Add field (List and My items):** opened by the + in the nav bar (no bottom bar). The field takes over the top of the screen with ביטול, the keyboard rises, and a suggestions group shows My items matches as item rows (already on the list → the "ברשימה" tag; otherwise "+"), then "הוספת ״…״" in Tint to create a new item. From the List, a picked or new item goes ON the list (same state as + on My items); from My items, a new item is created OFF the list. New items get category "אחר". Return ("הוספה") adds the top match and keeps the field open. There is no add-item sheet: name, category, price match and delete live in the Edit item sheet (long-press a row), and category picker / product match push inside it. Delete is also the trailing swipe action (red), with an Undo toast instead of a confirm.
- **Form row:** label, trailing value in Secondary Label, disclosure chevron in Control Outline.
- **Store row:** chain (Body), "branch · distance" detail, amber missing count when partial, trailing Price Row. No disclosure.

### Switch
- One switch app-wide (iOS style, mirrored for RTL): tint track when on, Control Fill when off. Used for settings only (nearby alerts). Never for list membership: My items uses the add-to-list button.

### Navigation
- **Tab bar:** standard iOS, 4 tabs (List, My items, Compare, Settings), Lucide icons with Caption labels; selected = tint, unselected = Secondary Label; 85% surface with blur and a top hairline.
- **Nav bar:** large titles on top-level screens; trailing / leading nav items in tint (share, add, radius pull-down).
- **Sheets:** standard iOS sheets on Sheet Surface, 16pt top radius, grabber in Control Outline, over the Scrim. Used for edit item, what's missing and share. Category picker and product match push inside the edit-item sheet; join a list pushes inside the share sheet (back = "חזרה"). Pull-down menus (the Compare radius) are iOS menus, not sheets.

### Icons
- Lucide at 1.75 stroke on a 24 grid (matches `lucide-react-native`). Color always from a token. Directional icons flip in RTL.

### Best Store (signature)
The first group on Compare and the app's whole answer: chain in Title 3, "branch · distance" in Secondary Label, the total in Price Hero, a green saving line against the next branch, an amber coverage row (at least 44pt) that opens the what's-missing sheet, then a filled "Navigate with Waze" and a plain "Order online". Onboarding reuses this group as its illustration: onboarding illustrations are real UI fragments, never drawn art.

### Motion, haptics and gestures (carried from v1 where still valid)
- **Springs:** `snappy` (damping ratio 1.0, 0.30s) for press feedback, swipe return, segmented thumb, list reorder on Compare; `gentle` (1.0, 0.45s) for the sign-in / sign-up form reflow; `bouncy` (0.75, 0.40s) only for the swipe action icon arming; `sheet` (0.85, 0.35s) for sheets. No bounce elsewhere.
- **Durations:** fast 150ms (check-circle fill, fades), base 200ms (row exit and layout, chevron rotation); a 450ms hold between a check and the row leaving so the strike-through registers. All UI timing at or under 280ms; ease-out `cubic-bezier(.23,1,.32,1)` for enter / exit, no ease-in.
- **Swipe to tick:** the iOS leading swipe action (in Hebrew, the action appears at the right edge as the row moves left). Gesture hysteresis 10pt horizontal to activate, fail on 8pt vertical; commit on distance (35% of width, "armed") or a flick over 800pt/s; rubber-band past 60%. Every swipe has an accessibility action that does the same thing. Note: v1 code swipes toward start; the v2 direction is a migration change.
- **Haptics** (on the causal frame, always paired with a visual): item checked → success notification; put back → selection; add to list / remove from list → selection; switch flip → selection; tab change → selection; segment change → selection; long-press to edit → light impact; delete confirmed → medium impact; sign-in validation failed → error notification; invite link copied → success notification. Buttons do not fire a blanket haptic.
- **Reduced motion:** fewer and gentler, not zero. Press scale off, segmented thumb and switch jump, chevron rotation instant, check pulse off, swipe arming keeps opacity but drops scale, skeletons static. Open item: the sheet spring does not yet honor reduced motion in code.

### Accessibility
- Check circle is a checkbox with `checked`; tabs are a tab list with `selected`; the segmented control is a tab list; switches are switches with `checked`; the My items add-to-list button is a button labelled "Add <item> to the list" / "Remove <item> from the list" with `selected` when on the list; titles are headers.
- Every touchable has a role and label; every target at least 44pt.
- Dynamic Type: text scales, containers use minimum heights, long Hebrew strings cap at 2 lines in rows and 1 in titles.
- Skeletons and decorative fragments are hidden from assistive tech.

## Do's and Don'ts

### Do:
- **Do** build every screen as iOS inset grouped lists on Grouped Gray with 16pt gutters and 52pt rows.
- **Do** use the tint for every pressable element and only for pressable elements.
- **Do** give each screen exactly one filled button, for its one primary action; everything else is tinted or plain.
- **Do** show prices in tabular figures, and the best basket total in Price Hero (40/48).
- **Do** show partial coverage in amber next to the price, opening the what's-missing sheet.
- **Do** design RTL first: leading / trailing, mirrored switch, flipped directional icons.
- **Do** inset hairline separators to the text start.
- **Do** use standard iOS tab bar, sheets, large titles and swipe actions.

### Don't:
- **Don't** use green for anything but money saved, amber for anything but partial coverage, or red for anything but destructive actions.
- **Don't** add shadows to groups, rows or buttons; only sheets and the segment thumb cast one.
- **Don't** bring back the v1 vocabulary in v2 screens: green produce primary, card stacks, coverage bars, category chips on item rows, Best-price badges, custom tab bars or a second switch style.
- **Don't** put eyebrow or uppercase kicker labels above titles.
- **Don't** draw illustrations; onboarding shows real UI fragments.
- **Don't** invent savings claims; the green line only compares this basket against the next branch.
- **Don't** write color literals outside the theme; every value comes from these tokens once the code is migrated.
