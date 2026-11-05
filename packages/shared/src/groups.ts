/** Product group rules both the Internal dashboard (its forms) and the api (the bodies it accepts) check: docs/adr/0007. */
export const GROUP_MEASURES = ["kg", "l", "unit"] as const;
export type GroupMeasure = (typeof GROUP_MEASURES)[number];
/** A group's name, and a unit group's pack count (a kilo or liter group's is 1). */
export const GROUP = { nameMaxLength: 100, packCount: { min: 1, max: 1000 } } as const;
