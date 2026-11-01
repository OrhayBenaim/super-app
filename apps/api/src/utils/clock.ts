export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };

export function fakeClock(start: Date) {
  let t = start.getTime();
  return { now: () => new Date(t), advance: (ms: number) => void (t += ms) };
}
