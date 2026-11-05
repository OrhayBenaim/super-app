---
status: accepted
---

# Browse reads a packed copy of the price data, with its group cards stored by the Price sync

Home and Promotions show every group card with a Product priced nearby. Worked out per request from `prices` and
`promotions`, a request in central Tel Aviv (230 stores within 10 km) read about 1.5M price rows and 2M promotion rows
and grouped about 78k Product names: 3.5 s for Home and 20 s for Promotions. Reading those rows alone takes about 0.7 s
with the best index, and grouping the names about 1 s. So browse reads a copy of the same data in SQLite, packed for it:

- **Per store, one row** (`store_browse`): its Products, Shelf prices and (Product, Promotion) pairs as binary arrays,
  written by ingest in the transaction that writes the store's prices or Promotions. A request reads one row per nearby
  store and adds them up in a loop.
- **A Chain's Promotion terms once** (`chain_promotions`), shared by the Chain's stores that publish the same PromotionID
  and terms.
- **Every Product's group card** (`browse_groups`, and `browse_catalog`, `browse_group_data`, `browse_names`), worked out by docs/adr/0001's rules over every
  Product priced at any store, and stored at the start and end of each Price sync (and after the ingest job). A request
  only narrows a card to the lead words of the Products it holds there (a Promotions card of Tnuva's milk is
  "חלב תנובה"), as browse did before.

Nothing is kept in memory between requests. Search and Compare still read `prices` and `promotions`.

## Considered options

- **Better SQL over `prices`**: a covering index and totals before the join take Home from 2.2 s to about 0.7 s for
  the price query alone; the request still reads every nearby price row.
- **An in-memory copy in the api** (the first try): about 85 ms for Home, but its memory grows with the stores browsed
  (about 170 MB for Tel Aviv, more for all of Israel) and a restart loads it again.
- **Group cards per request** (docs/adr/0001 as written for search): about 1 s per Home request at Tel Aviv's size.

## Consequences

- A store's new prices and Promotions show on the next request. A Product new in a Price sync shows in browse once the
  sync stores the groups again, at its end.
- A change to the group rules reaches browse at the next Price sync (search and Compare see it at once).
- Group cards are worked out over every Product priced anywhere, then narrowed to what a request holds: a card's name
  and size come from all its Products, not only the nearby ones.
- Each Price sync spends about 5 s twice regrouping; the first sync after the migration also packs every store (about
  20 s), a store per transaction.
- Unfiltered Promotions in central Tel Aviv is still about 350 ms: about 9.6k cards (3.7 MB of JSON) from 2M offers.
