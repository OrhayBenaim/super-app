/** m:ss, rounding up so the clock shows 0:00 only once time is really up. */
export function formatCountdown(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
