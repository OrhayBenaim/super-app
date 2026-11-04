---
status: accepted
---

# The Price sync takes Product types from Open Food Facts

Home groups Products by Product type (CONTEXT.md), but the price files carry no category: a Product is a barcode, a
name cut off at about 20 characters, a manufacturer and a unit. So each Price sync looks up, by barcode, every Product
that has no Product type yet on Open Food Facts' product API. A Product's type is the top-level category its
`categories_tags` start with. A barcode Open Food Facts doesn't know, or knows with no category, is of the Product type
Other and is looked up again a week later. A Product with no barcode (a Chain-only code) is Other and never looked up.
The Product type table holds only the top-level categories our Products have, plus Other; nothing else is seeded.

## Considered options

- **Chain online shops:** they sort their products into departments, but none documents an API, most sit behind
  Cloudflare or Radware bot protection (docs/research/price-data.md), and every Chain has its own department tree, so
  we would scrape eleven sites and still have to map their trees onto one.
- **LLM classification of names:** cost on every Price sync, answers that can change between runs, and a guess made
  from a cut-off name rather than data anyone can check.
- **Name rules** (keyword lists per type): a list someone has to keep up to date for 130k Products, the same reason a
  curated list of Product groups was rejected in ADR-0001.

## Coverage

Open Food Facts knows few Israeli products. Before the spec, 0 of 60 random Israeli (729) barcodes from our real price
files had a category, against 7 of 26 imported ones. A second sample on 2026-11-04 from the barcodes in our test price
files gave 2 of 10 Israeli and 14 of 45 imported. At launch nearly every Israeli Product is Other, and Home is mostly
Other until Open Food Facts learns them. We accept that: the alternatives above are worse, and the weekly retry picks up
what Open Food Facts adds later.

The top-level categories those barcodes started with were `en:snacks` (10), `en:dairies` (3),
`en:beverages-and-beverages-preparations` (2) and `en:plant-based-foods-and-beverages` (1).

## Consequences

- **Rate limit.** Open Food Facts allows 15 product reads a minute per IP and may ban an IP that goes over; a global
  limit answers 503 under load. It also asks anyone fetching "more than a few hundred products" to use its data export
  instead (https://openfoodfacts.github.io/openfoodfacts-server/api/, read 2026-11-04). 15 a minute is at most 21,600
  lookups a day, and our Chains sell tens of thousands of barcodes (28,617 codes appear at two or more Chains alone),
  so the first lookups take days, not one Price sync. The lookup step has to stop at a time budget and leave the rest
  for later syncs, so that it never holds back prices. If the backlog doesn't drain, the data export is the fallback.
- **User-Agent.** Reads need no account, only a custom User-Agent in the form `AppName/Version (ContactEmail)`.
- **Hebrew names.** Of the 62 top-level categories in Open Food Facts' categories taxonomy (2026-11-02), 29 have a
  Hebrew name, and some are wrong (`en:cooking-helpers` is "מסייעי אפייה", baking helpers).
  `en:beverages-and-beverages-preparations` has none. So the Hebrew names live in the mobile strings, keyed by
  category id, and fall back to Open Food Facts' English name, which is stored with the Product type.
- A Product can sit under several top-level categories (a chocolate bar is both `en:snacks` and
  `en:cocoa-and-its-products`). Taking the first one keeps the rule simple, and in every sample the first tag was a
  top-level category. Some Products land under a type a shopper wouldn't pick (Nutella is `en:breakfasts`).
- The same words can make one Home card under a real Product type and another under Other, until Open Food Facts
  learns the rest of those barcodes. The spec (#132) accepts that.
