import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads something from the bot once (and again on `reload`), keeping the last answer while it refreshes. */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const fn = useRef(load);
  fn.current = load;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const v = await fn.current();
      if (alive.current) { setData(v); setError(false); }
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, setData, error, loading, reload };
}
