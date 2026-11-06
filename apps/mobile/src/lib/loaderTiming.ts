import { useEffect, useRef, useState } from "react";

/** True while `on`, and for the rest of `ms` after it turned on. */
export function useMinDuration(on: boolean, ms: number) {
  const [held, setHeld] = useState(on);
  const since = useRef(0);
  useEffect(() => {
    if (on) {
      since.current = Date.now();
      setHeld(true);
      return;
    }
    const id = setTimeout(() => setHeld(false), Math.max(0, since.current + ms - Date.now()));
    return () => clearTimeout(id);
  }, [on, ms]);
  return on || held;
}

/** True once `on` has stayed on for `ms`, so a wait that ends sooner shows nothing. */
export function useDelayed(on: boolean, ms: number) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on && late;
}
