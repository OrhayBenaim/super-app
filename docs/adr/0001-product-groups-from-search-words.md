# Product groups are defined by their words, not stored on products

A Product group (CONTEXT.md) is identified by its normalized words ("בורגול", "בורגול דק"). Its members are
whichever products currently pass the group rules for those words: the name starts with them, it is not a "with"
product or a substitute, and it is measured the same way. An Item matched to a group stores those words, not a group
id, and the members are worked out again on every search and every Compare. Groups nest freely ("סוגת בורגול דק" is in
"בורגול", "בורגול דק" and "בורגול סוגת" all at once) and need no table, migration or backfill. Products added by a
Price sync join their groups right away.

## Considered options

- **A group key computed during ingest (the old Produce group `group_key`):** strip brand, size and Chain label from
  each name and give products whose remaining names match one key. Rejected because it can't be done reliably: names
  are cut off at about 20 characters ("בורגול עבה 1קג רמי ל"), and the manufacturer field names the packer or
  importer, or is empty, so brand words can't be told apart from the product. A single key also can't express nested
  groups, so "keep typing to narrow" would need a second mechanism.
- **A curated list of groups (by hand or LLM-assisted):** precise, but a list someone has to keep up to date for
  130k products that change with every Price sync.

## Consequences

- A product code no longer stands for a group, so `products.group_key` and the expansion of a member's code in Compare
  go away. Items matched to a former Produce-group product are moved to the group named by that product's normalized
  name.
- Changing the group rules (leading words, substitute words, noise words) changes what existing matched Items mean,
  without any migration. That is intended, but rule changes must be checked against real searches, not only unit
  tests.
- Search and Compare do the group work at query time, so their cost grows with the size of a group, not the size of
  the list.
