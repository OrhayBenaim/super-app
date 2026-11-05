---
status: accepted
---

# A Price sync never changes an existing store or Product

A Price sync creates the stores and Products it has not seen, and updates prices and Promotions, but never changes an
existing store's name, address, city or location, or an existing Product's name. Those come from the Chain's files once;
after that only the Grocer team changes them, on the Internal dashboard. The sync keeps the address the Chain publishes
now next to the store, and the dashboard flags a store whose published address differs, so a real move is noticed and
fixed by hand.

Before this, each Price sync overwrote a store's details from the Stores file and cleared its location when the address
changed, so it was geocoded again. That would silently undo every correction made on the dashboard.

## Considered options

- **Overrides that win over the sync**: keeps following the Chains automatically, but every corrected field needs a second
  value and a rule for which wins, for data that rarely changes.
- **Let the sync overwrite**: no new code, but corrections last only until the next Price sync, three times a day.

## Consequences

- A store that moves keeps its old address and location until the team edits it. The geocoder only fills stores with no
  location.
- Products already behaved this way (the first Chain to publish a barcode names it); stores now match them.
