/** How long the List's basket must hold still before the "Cheapest" row asks Compare again. */
export const SETTLE_MS = 1000;

/** Calls `fn` with the last arguments once `ms` pass without another call, or at once when `immediate()` is true. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number, immediate?: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = (...args: A) => {
    clearTimeout(timer);
    if (immediate?.()) fn(...args);
    else timer = setTimeout(() => fn(...args), ms);
  };
  call.cancel = () => clearTimeout(timer);
  return call;
}
