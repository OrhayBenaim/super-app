# Grocer

A shopping list app for Israel that compares what a list costs at nearby supermarkets.

## Language

### Lists and people

**User**:
A person with a Grocer account.
_Avoid_: Customer, account holder

**List**:
A named shopping list of items. Every List has exactly one Owner.
_Avoid_: Shopping cart, basket

**Owner**:
The User who created a List. Only the Owner can rename it or remove Members, and the Owner cannot leave it.
_Avoid_: Admin, creator

**Member**:
A User other than the Owner who joined a List through its Invite code.
_Avoid_: Collaborator, guest

**Invite code**:
A short code that lets a User join a List as a Member. A List has one Invite code at a time: each time someone in the List shares it, a new code is made and the previous one stops working.
_Avoid_: Join code, share code

**Invite link**:
A link that carries a List's Invite code and opens Grocer on joining that List. If the recipient has Grocer but is signed out, they join after they sign in. If they don't have Grocer, the link does not survive installing it; they join by typing the Invite code.
_Avoid_: Share link, deep link (as a domain term)

**Shared list**:
A List that has at least one Member besides its Owner.
_Avoid_: Group list, joint list

**Quantity**:
The amount of an item to buy: a count of units, or kilos when the item is Sold by weight. It starts at 1 (1 ק"ג for weight), stays on the item when it is checked off or taken off the List, and comes back when the item is added again. Changing the item's match to one Sold by the other way starts it over at 1.
_Avoid_: Amount (in code), count, size (a product's pack size is something else)

**Sold by**:
How an item's Quantity is measured, `unit` or `weight`, taken from what it is matched to: a product the Chain prices per kilo, or a Product group of such products (produce), is Sold by weight; everything else, unmatched items included, is Sold by unit.
_Avoid_: Unit type, measure (a product's measure is kilo, liter or unit)

**Basket breakdown**:
The per-line view of one store's Compare total: each item's Quantity × its price there, then the items that store does not price and the items with no match.
_Avoid_: Receipt, what's missing

### Prices

**Price sync**:
One run that brings every Chain's prices up to date: download each Chain's newest Stores and PriceFull files for all its stores, load them, and geocode every store that has no location yet (new, moved, or not found before). A Chain that fails does not stop the others. Only one Price sync runs at a time.
_Avoid_: Fetch, scrape, import (each names only one part of it)

**Scheduled sync**:
A Price sync started by the schedule, three times a day outside rush hours: early morning, midday and late night.
_Avoid_: Cron, nightly job

**Manual sync**:
A Price sync started by hand from the internal dashboard. It is ignored if a Price sync is already running. When it finishes, even with Chain failures, the next Scheduled sync is skipped; when it is interrupted, nothing is skipped.
_Avoid_: Force sync, refresh

**Interrupted sync**:
A Price sync that stopped before every Chain was done, because the worker was shut down, crashed or lost contact; a Price sync still running 4 hours after it started counts as interrupted too. Chains it already finished keep their new prices. It never causes a Skipped sync.
_Avoid_: Failed sync, aborted sync

**Skipped sync**:
A Scheduled sync that does not run, because a Price sync was running at its time or because a Manual sync finished since the previous scheduled time.
_Avoid_: Cancelled sync

**Chain failure**:
A Chain that could not be brought up to date during a Price sync: its Stores file could not be downloaded or loaded, none of its price files could be loaded (failed, or all name stores missing from its Stores file), or its prices could not be saved. It is logged and recorded. Stores whose prices were saved before the failure keep them; the rest keep their previous prices until a later Price sync succeeds for that Chain. A single price file that cannot be downloaded or loaded is not a Chain failure: that store keeps its previous prices and the rest of the Chain still updates.
_Avoid_: Sync failure (the Price sync itself still finishes)

**Product image**:
A picture of a Product, found by its barcode in outside sources (a Chain's online shop first, Open Food Facts second). Users cannot set or change it. A Product without a barcode, or one no source knows, has no Product image, and nothing is shown in its place. It is shown when picking a Product for an item and when editing an item.
_Avoid_: Photo, thumbnail, picture (as separate terms)

**Product group**:
Products that are the same thing to a shopper, whatever their brand, pack size or Chain label: סוגת's, מיה's and Rami Levy's own bulgur are all the Product group "בורגול". More words make a narrower Product group: a word that changes what the product is (a variety, organic, fat percent, lactose-free) narrows it ("בורגול דק", "בורגול אורגני"), while brand, size and Chain label never split one. A dish made from the product is not in its group ("בורגול עם גרגירי חומוס" is not bulgur). Produce follows the same rules: names match once origin, grade, "by weight" and "loose" words, spellings and plurals are evened out ("בננות ישראל" and "בננה מובחרת" are both "בננה"), and packed and loose are different groups ("גזר ארוז" vs "גזר"). A product is in a group only when its name starts with the group's words ("שוקולד חלב" is not milk). A product made "with" something, or a substitute for the real thing, is only in a group whose words say so: "קוטג עם זיתים" is not in "קוטג", and neither is "קוטג' טבעוני". Every product in a group is measured the same way: by kilo, by liter or by the unit. Produce is always by kilo. Sweetened condensed milk is sold by weight, so it is not in "חלב". Things counted by the unit are a different product for each pack count: a carton of 12 eggs and a carton of 30 are not one group. A User matches an Item to a Product group by picking it, the same way they pick a single product; nothing is matched for them. For a group measured by kilo or liter, Compare picks each store's cheapest product by price per kilo or liter, so a 1 ק"ג bag at ₪6.80 beats a 500 גרם bag at ₪3.70, and the Item's Quantity is kilos when the group is Sold by weight (produce), or else a number of the group's commonest pack size. For a group counted by the unit, every product is the same pack (a carton of 12 eggs). Compare picks the cheapest pack, and the Item's Quantity is a number of packs. Compare names the product each store's price comes from.
_Avoid_: Generic product, canonical product, Produce group, kind, category (an Item's category is something else)

### Account lifecycle

**Account deletion**:
The permanent, immediate removal of a User and everything they own: the Lists they own (for every Member, too) and their membership in other people's Lists. There is no undo and no grace period.
_Avoid_: Deactivation, closing the account

**Data deletion**:
The permanent, immediate removal of everything a User owns while keeping the User: the Lists they own (for every Member, too) and their membership in other people's Lists. They stay signed in and start fresh with a new empty List. There is no undo.
_Avoid_: Reset, wipe, clear data

**Password reset**:
A User who signs in with email and password proves they own that email with a Reset code, then sets a new password and is signed in. Users who only sign in with Google or Apple have no password and cannot reset one.
_Avoid_: Password recovery, forgot password (except as the link text)

**OTP**:
A one-time code emailed to a User: a Reset code or a Deletion code. Every OTP is 6 digits, valid for 5 minutes, dies after 3 wrong tries, and works only for what it was sent for. A new one replaces the last one sent for the same thing.
_Avoid_: PIN, token, one-time password

**Reset code**:
The OTP emailed to the User for a Password reset.
_Avoid_: PIN, token

**Deletion code**:
The OTP emailed to a signed-in User before an Account deletion or a Data deletion done on the web. A correct code leads to a last confirmation, and confirming commits that deletion. It works only for the deletion it was requested for; cancelling kills it.
_Avoid_: PIN, Reset code (that one is only for Password reset)
