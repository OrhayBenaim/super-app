---
version: 1
slug: "app"
primary_target: "app"
related_targets: []
---

# Grocer app (all signed-in and auth screens)

Scope: the whole iOS-first mobile app, designed in Figma (YncE254fQ7DyfktwvCsqR0). Visitor mode: Operate.
Audience and job: a household sharing one list; check off items one-handed in a store, and find the cheapest nearby branch for the whole basket.
Constraints: Hebrew-first RTL, iOS conventions, Dynamic Type, light and dark. Code is not changed in this round.
User feedback that binds: must not look like every grocery app, must not be busy in the store, must not hide the price. The user chose the standard iOS design language and asked for Grocer's own expression inside it, with no single app as a benchmark.

## Direction contract

THESIS: Grocer is a native iOS utility whose one job is the price answer. It refuses the category's green produce look, card stacks and coverage bars; every screen is a grouped list with one action.

OWN-WORLD: iOS system grouped backgrounds and inset groups, SF type scale (Heebo stand-in in Figma for Hebrew), one ultramarine tint for everything interactive, green used only as the money-saved state, amber only for partial coverage, red only for destructive. No shadows except sheets; hairline separators.

STORY: open the list and see what's missing and where the basket is cheapest; tick items off with a tap or swipe; Compare answers "where, how much, how much less" in one glance and hands off to Waze.

FIRST VIEWPORT: Compare: large title, one summary line, segmented control (price/distance/coverage) with the radius as a pull-down in the nav bar. Below, the best branch as the first inset group: chain, branch and distance, the total at 40pt tabular, a green "₪6.50 less than Rami Levy" line, coverage as text, then a full-width tinted Navigate button and a plain Order online. Other branches follow as one plain inset list with trailing prices. Standard tab bar.

FORM: canon (standard iOS), chosen by the user after seeing the flyer, shelf-label and departures sketches. seed:cf42fcaabb0b8657

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
