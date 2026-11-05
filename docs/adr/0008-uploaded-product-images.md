---
status: accepted
---

# The Grocer team can upload a Product image; it wins over the outside sources

A Product image is still found by barcode (a Chain's image server, then Open Food Facts), but the Grocer team can
upload one for a Product on the Internal dashboard, and an uploaded image wins everywhere: in the Grocer app and on
the dashboard. Removing it brings back the one found by barcode. This reverses spec #168's "storing Product images on
the server" out-of-scope line.

- The dashboard sends the file to the api's private app (ADR 0005), which checks it (PNG, JPEG or WebP by its bytes,
  at most 5 MB) and stores it on the api's data volume, one file per Product code, under `IMAGES_DIR`.
- The public api serves an uploaded image at `/api/products/:code/image` with cache headers, and lists the codes that
  have one at `/api/products/images` (small; it changes only when the team uploads or removes one).
- `@grocer/shared/product-image` takes that list as its first source: a code in it answers the api's URL; any other
  code is looked up by barcode as before. So the app makes no extra request per image, only one for the list.
- A Product without a barcode (a Chain-only code) can have an uploaded image.

## Considered options

- **A HEAD request to the api before every lookup:** simpler, but one more request per Product on Home's cards.
- **Image bytes in SQLite:** one file to back up, but it bloats the database the Price sync rewrites three times a day.

## Consequences

- New env var `IMAGES_DIR` (default: an `images` folder next to the database), on the same volume as the database.
- The app refetches the uploaded list with its other data; an image uploaded while the app is open shows after that.
- CONTEXT.md's Product image term changes: the team can now set one; Users still cannot.
