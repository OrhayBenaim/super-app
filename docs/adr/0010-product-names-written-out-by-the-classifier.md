---
status: accepted
---

# The classifier writes each Product name out in full, in place of the Chain's

Price files cut names off at about 20 characters and abbreviate words (גב. for גבינה, חט. for חטיף, מש. for משחת).
Product groups are worked out from names (docs/adr/0001), so an abbreviation became a group of its own: 78 different
cheeses in one group named "גב". So the request that gives a Product its Product type (docs/adr/0003) also returns its
name written out in full, and that replaces `products.name`. Ingest already never renames a Product ("first chain to
publish a barcode names it"), so a later Price sync keeps the full name.

The model may expand abbreviations, finish a cut-off word it is sure of and fix spacing. It keeps the brand, the size
text, every number and the Chain's word order: sizes are read from the name (`measureOf`), so an answer whose numbers
differ from the name it was sent is rejected and the name is left as it was.

## Considered options

- **A separate display-name column**: keeps the Chain's form, but groups and search would still run on the abbreviated
  one, so the groups stay broken unless every reader switches columns.
- **A list of abbreviations in the group rules**: fixes grouping only, can't read one-letter forms that mean several
  things (ק. is קרם or קפה), and is a list someone has to keep up to date, as docs/adr/0003 rejected for types.

## Consequences

- **The Chain's own short name is not kept.** A re-clean starts from the full name. A wrong name is fixed by clearing
  the Product's name and type: the next Price sync's ingest fills the Chain's name again and the classifier rewrites it.
- **Writing a name out can move a Product to another Product group**, as any rule change does (docs/adr/0001). Items
  whose group ref no longer names a group are moved to the live group their own name gives, and the team's edits of
  such a group to the one their display name gives.
- **A Product not typed yet still has the Chain's name**, until a Price sync reaches it.
