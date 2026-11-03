/** How an item's Quantity is measured: a count of units, or kilos. Unmatched items are "unit". */
export type SoldBy = "unit" | "weight";

/** Quantity rules. The API enforces them; the app's stepper follows them. */
export const QUANTITY = {
  start: 1,
  max: 99,
  step: { unit: 1, weight: 0.5 },
} as const;

/** Positive, at most the max, and a whole number of steps (the minimum is one step). */
export function isValidQuantity(q: number, soldBy: SoldBy) {
  const step = QUANTITY.step[soldBy];
  return Number.isFinite(q) && q >= step && q <= QUANTITY.max && Number.isInteger(q / step);
}

/** To the next step up (+1) or down (-1), kept between one step and the max. An off-step value lands on the step. */
export function stepQuantity(q: number, soldBy: SoldBy, dir: 1 | -1) {
  const step = QUANTITY.step[soldBy];
  const steps = q / step;
  const next = dir === 1 ? Math.floor(steps) + 1 : Math.ceil(steps) - 1;
  return Math.min(QUANTITY.max, Math.max(step, next * step));
}
