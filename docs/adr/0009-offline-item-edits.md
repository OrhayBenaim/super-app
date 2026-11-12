---
status: accepted
---

# The phone makes item ids; item edits go through a saved, ordered offline queue with last write wins

Item edits (add, update, delete) must feel instant, never bounce back, and survive weak reception inside a supermarket.
So the phone makes the item's id, and every edit joins a queue per List that is kept on the phone and sent to the server
in tap order. Spec #215.

- **The phone makes the id.** Creating an item requires a UUID made by the phone (not a product code or a Product group
  ref); a malformed one is a 400. The row has its real id from the first tap, so a new item can be changed, checked off or
  deleted before the server has heard of it. An add sent again (a timeout, a restart) with an id that already exists on
  the same List returns that item and creates nothing; an id on another List is a 404, so it is not revealed. Undo
  re-creates a deleted item with the same id and every field, Quantity included.
- **One ordered queue per List.** Item edits are TanStack mutation defaults on the QueryClient, keyed by kind under
  `items`, all in one mutation `scope` per List, so they go out one at a time in tap order. Each patches the cached List
  at once. The server's reply overwrites only what the server owns (`soldBy`, and `quantity` after a re-match), never a
  field a later queued edit changed. Reads of that List (poll, focus, invalidation) wait until the queue is empty.
- **Saved on the phone.** The QueryClient is saved to expo-sqlite's `kv-store`: only the lists query, the List detail
  queries and their categories, plus pending and paused item edits. The copy lasts 30 days, with no age limit on queued
  edits inside it (past 30 days the queries are dropped, the queued edits still restore), and belongs to the signed-in
  `user.id`: a copy for another User is thrown away on restore, and a different User signing in with no Sign out first
  starts from an empty cache and queue. List reads wait until the restore is done. Restored edits are sent once the phone
  is online, however many days later. Signing out and Account deletion clear the cache, the queue and the saved copy (a sign-out that fails offline
  clears nothing: the User is still signed in). Data
  deletion is the web `/account` page, so the phone has nothing to wipe until the next sign-in, which throws the copy away
  if the User changed.
- **Last write wins.** Two Members changing the same item settle on whatever the server received last. No conflict
  resolution beyond that.
- **One failure rule.** A network error or timeout waits for the network and is sent again without limit; a 5xx, or an
  error that is not a response at all (a bug), is retried 3 times, then only that item is undone with a "Couldn't save" toast; a 404 on a delete counts as done and on an add or
  update is dropped quietly; any other 4xx undoes that item with the toast. A failed edit never restores a whole-List
  snapshot.

## Considered options

- **Server-made ids, with temporary ids mapped to real ones:** the usual shape, but an edit queued against a new item
  needs its id rewritten once the add is answered, in every queued edit, in the cache and in the saved copy; a retried
  add with no id to match could create the item twice.
- **A separate local-first store (zustand or SQLite as the source of truth, with background sync):** gives full offline
  reads, but it is a second copy of the List to keep in step with TanStack Query's cache, plus a sync engine, for a List
  of a few dozen items that the cache already holds.
- **Undoing on any failure:** what the app did before. A tap that couldn't reach the server was undone, so a User in a
  supermarket with no reception had to notice and tap again.

## Consequences

- No backward compatibility: there are no users yet, so an old build that sends no item id is not supported.
- Compare, Home, Promotions and browse queries are not saved; they refetch as before.
- An edit sent only after an app restart fires no success analytics event for its original tap.
- A saved copy older than 30 days loses its queries but still sends its queued edits.
- New native dependencies (`@react-native-community/netinfo`, `expo-sqlite`) need a new native build.
- CONTEXT.md does not change.
