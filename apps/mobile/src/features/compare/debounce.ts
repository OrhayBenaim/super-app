/** How long the List's basket must hold still before the "Cheapest" row asks Compare again. */
export const SETTLE_MS = 1000;

/** Calls `fn` with the last arguments once `ms` pass without another call. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  call.cancel = () => clearTimeout(timer);
  return call;
}
