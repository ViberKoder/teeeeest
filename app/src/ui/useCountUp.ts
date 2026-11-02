import { useEffect, useRef, useState } from 'react';

/** Animates a bigint balance towards its new value (display only — the real value is always exact at the end). */
export function useCountUp(target: bigint, ms = 800): bigint {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const diff = Number(target - start);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = k >= 1 ? target : start + BigInt(Math.round(diff * e));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}
