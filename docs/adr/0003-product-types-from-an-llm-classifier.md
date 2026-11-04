---
status: accepted
---

# The Price sync classifies Products into our own Product types with an LLM

Home groups Products by Product type (CONTEXT.md), but the price files carry no category: a Product is a code, a name
cut off at about 20 characters, a manufacturer and a unit. So the Product types are a fixed list of 15 that we own, in
display order with Other last (`dairy-eggs`, `meat-fish`, `produce`, `bakery`, `drinks`, `snacks-sweets`, `pantry`,
`frozen`, `canned`, `cleaning-home`, `personal-care`, `baby`, `pets`, `alcohol`, `other`), and each Price sync gives a
type to every Product that has none yet by asking a small LLM. The classifier sends each distinct name once, with its
manufacturer, size and Sold by, in batches of about 100, and only for Products with a current price. It speaks the
OpenAI-compatible Chat Completions spec, so the operator picks the provider and model by supplying a base URL, a key and
a model name. The model only picks an id; the Hebrew and English names live in the mobile strings, keyed by id.

## Considered options

- **Open Food Facts** (the first version of this ADR): look up each barcode and take the top-level category its
  `categories_tags` start with. Rejected on the evidence:
  - **Coverage.** Before the spec, 0 of 60 random Israeli (729) barcodes from our real price files had a category,
    against 7 of 26 imported ones. A second sample on 2026-11-04 from the barcodes in our test price files gave 2 of 10
    Israeli and 14 of 45 imported. Home would have been mostly Other at launch.
  - **No barcode, no type.** Produce and Chain-only codes have no barcode, so Open Food Facts can't type them at all.
  - **Rate limit.** It allows 15 product reads a minute per IP, may ban an IP that goes over, and asks anyone fetching
    "more than a few hundred products" to use its data export instead
    (https://openfoodfacts.github.io/openfoodfacts-server/api/, read 2026-11-04). That is at most 21,600 lookups a day
    against tens of thousands of barcodes (28,617 codes appear at two or more Chains alone), so the first pass would
    take days.
  - **Hebrew names.** Of the 62 top-level categories in its taxonomy (2026-11-02), 29 have a Hebrew name, some are wrong
    (`en:cooking-helpers` is "מסייעי אפייה", baking helpers), and `en:beverages-and-beverages-preparations` has none.
    Its tree also puts Products where a shopper wouldn't look (Nutella is `en:breakfasts`).
- **Chain online shops:** they sort their products into departments, but none documents an API, most sit behind
  Cloudflare or Radware bot protection (docs/research/price-data.md), their terms haven't been checked, every Chain has
  its own department tree to map onto one, and each covers only what that Chain sells.
- **Name rules** (keyword lists per type): a list someone has to keep up to date for 130k Products, the same reason a
  curated list of Product groups was rejected in ADR-0001.

The first version rejected an LLM for its cost on every sync, answers that change between runs and guesses from cut-off
names. Classifying each Product once answers the first two: a typed Product is never sent again, so its type doesn't
change and later syncs send only new names. The third is accepted below.

## Why a provider-neutral spec

OpenAI, Anthropic, Google, OpenRouter and local servers all accept the OpenAI-compatible Chat Completions API. Speaking
it with plain `fetch` adds no vendor SDK, and the operator can switch providers, or move to a cheaper model, with a key
and a config change rather than a code change. With no key set, the step is skipped.

## Cost

The first pass is about 30k distinct names, roughly 1.5–3M input tokens: well under $1 on a small model, less on a
provider's batch tier. Later syncs send a few dozen names each. The step stops at a per-sync budget and leaves the rest
for the next sync, so a backlog never holds a sync up.

## Held to the fixed list

The classifier asks for JSON and checks each answer against the 15 ids. An id outside the list is a failure for that
Product, which stays untyped and is sent again by a later sync, so a made-up type never reaches Home. A Product the
model can place nowhere else is Other.

## Consequences

- **A wrong type is possible**, from a cut-off or brand-first name. It is fixed by clearing the Product's type, and the
  next Price sync classifies it again. There is no screen for this.
- **Untyped Products count as Other** on Home and Promotions until a Price sync types them, so the same words can make
  one card under a real Product type and another under Other for a while.
- **A new external dependency**, needed only by the Price sync. A failed request leaves its Products untyped for the
  next sync, never stops prices from saving and never causes a Chain failure. The Price sync records how many Products
  got a type, how many became Other and how many requests failed.
- **Product names leave our servers** for the operator's provider. They are public price-file data, never User data.
