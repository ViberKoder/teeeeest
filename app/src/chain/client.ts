import { TonClient } from '@ton/ton';
import { cfg, endpoints } from '../config';

let client: TonClient | undefined;

/**
 * toncenter allows about one request per second without an API key and answers 429 beyond that, which used to
 * blank the whole screen. Every call goes through one queue with a small gap, and a throttled call is retried.
 */
const GAP_MS = cfg.toncenterKey ? 120 : 1100;
let chain: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retriable = (e: unknown) => /429|5\d\d|timeout|network|fetch/i.test(String((e as { message?: string })?.message ?? e));

function queued<T>(f: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        const r = await f();
        await sleep(GAP_MS);
        return r;
      } catch (e) {
        await sleep(GAP_MS * (i + 1));
        if (i >= 3 || !retriable(e)) throw e;
      }
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

export function ton(): TonClient {
  if (!client) {
    const raw = new TonClient({ endpoint: endpoints.toncenter, apiKey: cfg.toncenterKey || undefined });
    client = new Proxy(raw, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? (...args: unknown[]) => queued(() => v.apply(target, args)) : v;
      },
    });
  }
  return client;
}
