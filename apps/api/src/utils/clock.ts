export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };

export function fakeClock(start: Date) {
  let t = start.getTime();
  return { now: () => new Date(t), advance: (ms: number) => void (t += ms) };
}

const jerusalem = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23",
});
const parts = (t: number) => Object.fromEntries(jerusalem.formatToParts(t).map((p) => [p.type, p.value]));
const offsetAt = (t: number) => {
  const p = parts(t);
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - (t - (t % 1000));
};

/** Israel wall-clock time without an offset ("2026-11-04T00:00:00.000", "2026-11-03 10:58:00") as an instant; NaN if unreadable. */
export function fromJerusalem(local: string) {
  const wall = Date.parse(`${local.trim().replace(" ", "T").slice(0, 19)}Z`);
  if (Number.isNaN(wall)) return NaN;
  return wall - offsetAt(wall - offsetAt(wall)); // the second pass lands on the right side of a daylight-saving change
}

/** The Israeli weekday of `d`: 1 = Sunday ... 7 = Saturday, as promotion files number them. */
export const jerusalemWeekday = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts(d.getTime()).weekday!) + 1;
