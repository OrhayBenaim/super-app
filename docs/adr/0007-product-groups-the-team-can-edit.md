---
status: accepted
---

# The Grocer team can edit and create Product groups; edits win over the word rules

ADR 0001 stays: a Product group is still found from its words, and its members are still worked out at query time.
On top of that, the Internal dashboard can correct a group and make new ones, and those corrections are stored:

- **Edits to a word group**, keyed by its group ref: a Product added to it, a Product removed from it, and a display
  name. A removed Product never re-joins that group, and an added one stays, whatever later Price syncs bring.
- **Groups made on the dashboard (Made groups)**: a name, a Product type and a measure (kilo, liter or unit, and the
  pack count for a unit group), and exactly the Products the team put in. Their group ref is `made:<id>`, a second
  ref form next to the words form, so a List item can match one like any other group.

Search, Compare, browse (Home) and the Promotions pages all read a group's members through the one group-members
rule, which applies the edits after the word rules. A Product the team added to several groups shows on Home on one card: its Made group's, else the first word group it was added to. A Made group is found by search when the query's words start its
name, and shows on Home under its Product type. Deleting a Made group leaves List items that matched it unmatched,
as a vanished Product does. A Price sync never changes edits or Made groups.

## Considered options

- **A curated list replacing the word rules:** rejected again for the reasons in ADR 0001 (130k Products that change
  every Price sync).
- **Editing the rules (noise words, substitutes) from the dashboard:** fixes many groups at once, but a wrong rule
  change silently changes every List item that matches a group; per-group edits are local and reversible.

## Consequences

- Two new tables (group edits, Made groups with their members); parseRef accepts `made:<id>`.
- browse's packed copy is rebuilt after a group edit the same way a Product type fix regroups one Product.
- A group edit changes what existing matched List items mean, on purpose.
