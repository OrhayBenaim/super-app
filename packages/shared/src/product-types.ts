/** Product types (CONTEXT.md, docs/adr/0003) in display order, Other last. Their names live in the mobile strings, keyed by id. */
export const PRODUCT_TYPES = [
  "dairy-eggs",
  "meat-fish",
  "produce",
  "bakery",
  "drinks",
  "snacks-sweets",
  "pantry",
  "frozen",
  "canned",
  "cleaning-home",
  "personal-care",
  "baby",
  "pets",
  "alcohol",
  "other",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];
