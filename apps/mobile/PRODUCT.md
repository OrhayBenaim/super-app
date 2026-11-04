# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

iOS conventions lead (large titles, sheets, 44 pt targets); Android ships the same design from the same Expo codebase.

## Users

An Israeli household (a couple or a family) sharing one shopping list. One person adds what's missing at home; another checks items off in the supermarket, often one-handed while pushing a cart, and wants to know which nearby supermarket is cheapest for the whole basket.

## Product Purpose

Keep one shared list of what the household is missing, and answer "where is this basket cheapest near me, and by how much?" from real chain price data. Success: the household shops from one list and goes to the cheaper store without doing the comparison themselves.

## Positioning

Whole-basket comparison, not per-item deals: the app prices the household's actual list at every nearby branch using the Israeli price-transparency files the chains are legally required to publish, and nudges the user (with a Waze handoff) when they pass the cheapest one.

## Operating Context

- Adding items at home, from the household's own catalog ("My items") of things it usually buys, grouped by the household's own categories.
- Checking items off in the store: a tap or a swipe, with a "Recently bought" section to put things back.
- Comparing branches within 5 / 10 / 20 km, sorted by price, distance or coverage (how many list items the branch prices).
- Sharing the list with an invite code or link; members see changes within seconds.
- A background geofence notification near the cheapest store opens Waze directly.
- "Order online" opens the chain's site with the list's priced items in the cart (or one tap from it) where the shop takes a cart link; elsewhere it copies the list to the clipboard first.

## Capabilities and Constraints

- Screens: onboarding (3 pages), sign in / sign up (email + password, Apple, Google), Shopping list, My items (+ add/edit item sheet with optional product match), Compare, Share (modal), Settings, nearby notification to Waze.
- Prices come from chain XML files ingested by the API; not every item matches a product, so coverage is partial and must be shown honestly.
- Expo SDK 58 / React Native; system fonts; RTL via start/end layout.
- Undecided: product name. "Grocer" is the working name and is not a binding commitment.

## Brand Commitments

- Hebrew is the primary language; every screen is designed RTL first, English mirrors it.
- Voice: short, plain, second-person plural in Hebrew (gender-neutral), no hype.
- Standing preference: the standard iOS design language (system navigation, grouped lists, native controls), with Grocer's own expression inside it rather than a borrowed look from any one app.

## Evidence on Hand

- Real chain data: Shufersal and Cerberus-hosted chains (e.g. Rami Levy) via `apps/api/src/ingest`; real fixtures under the API tests.
- No testimonials, user counts, savings statistics or press. Never invent savings claims ("save ₪X a month").

## Product Principles

1. The price answer is the hero: where it's cheapest and by how much, before anything else.
2. Usable one-handed in a busy store: few things on screen, big targets, nothing to read twice.
3. Honest coverage: show what a price is missing rather than hiding it.
4. Not another grocery app: no produce clichés, no gamification.
5. Shared by default: the list belongs to the household, not one person.

## Accessibility & Inclusion

WCAG AA contrast in light and dark, Dynamic Type, VoiceOver labels on every control, gesture alternatives for swipes, reduced motion respected.
