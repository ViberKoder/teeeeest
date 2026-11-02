import { cfg, endpoints } from '../config';

/**
 * TonAPI answers contract getters in one round trip. It is used next to toncenter (a separate rate limit), so reads
 * run in parallel instead of queueing behind one provider. Bursts are paced a little and throttled calls are retried.
 */
const GAP_MS = cfg.tonapiKey ? 60 : 380;
let tail: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function paced<T>(f: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        const r = await f();
        await sleep(GAP_MS);
        return r;
      } catch (e) {
        if (i >= 3 || !(e instanceof Throttled)) throw e;
        await sleep(700 * (i + 1));
      }
    }
  };
  const p = tail.then(run, run);
  tail = p.catch(() => undefined);
  return p;
}

class Throttled extends Error {}

export const tonapiFetch = (path: string): Promise<Response> =>
  paced(async () => {
    const res = await fetch(`${endpoints.tonapi}${path}`, { headers: cfg.tonapiKey ? { authorization: `Bearer ${cfg.tonapiKey}` } : undefined });
    if (res.status === 429 || res.status >= 500) throw new Throttled(String(res.status));
    return res;
  });

/** Runs a getter. `null` = the account does not exist (not deployed); anything else unexpected throws. */
export async function runGetter(address: string, method: string): Promise<bigint[] | null> {
  const res = await tonapiFetch(`/v2/blockchain/accounts/${encodeURIComponent(address)}/methods/${method}`);
  if (res.status === 404) return null;
  const j = (await res.json()) as { exit_code?: number; stack?: { type: string; num?: string }[] };
  if (!res.ok || j.exit_code !== 0 || !j.stack) throw new Error(`getter ${method} failed`);
  return j.stack.filter((x) => x.type === 'num' && x.num !== undefined).map((x) => BigInt(x.num!));
}
