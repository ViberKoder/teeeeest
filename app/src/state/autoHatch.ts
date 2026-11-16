import { Attach } from '@egg/sdk';
import { useEffect, useRef } from 'react';
import { api } from '../api/server';
import { eggClaim } from '../chain/actions';
import { readEgg } from '../chain/egg';
import { loadVerifiedEntitlement } from '../chain/entitlement';
import { askForGas } from '../chain/gas';
import { cfg } from '../config';
import { NeedTonError } from '../provider/tg';
import { useWallet } from './wallet';

/** Below this the claim's network fee is not worth paying on its own: the eggs still count in the balance and move with the next Send. */
const MIN_READY = 5_000_000_000n;
const RETRY_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * There is no "hatch" step for the player. Eggs earned in the game are first only a promise in the bot's ledger, then committed on
 * the blockchain in a signed root; moving them into the wallet needs one signed request. This does that quietly in the background
 * as soon as there is enough to be worth it, so the balance the player sees is always simply their balance. It checks the proof
 * locally before it sends anything, exactly like a manual claim did, and any failure is silent: nothing is lost, it tries again.
 */
export function useAutoHatch() {
  const w = useWallet();
  const busy = useRef(false);
  const last = useRef(0);
  const { provider, masterAddress, data } = w;
  const ready = data.ready;
  const ton = data.ton;

  useEffect(() => {
    if (cfg.demo || !provider || !masterAddress || busy.current) return;
    if (ready < MIN_READY || Date.now() - last.current < RETRY_MS) return;
    busy.current = true;
    last.current = Date.now();
    void (async () => {
      try {
        const raw = provider.address.toRawString();
        const { ent, cumulative, proof, root, state, init } = await loadVerifiedEntitlement(provider, masterAddress, data.me?.address === raw);
        if (cumulative <= state.claimed) return;
        const msgs = () => eggClaim({ state, cumulative, proof, root, init: init.init });
        try {
          await provider.send(msgs());
        } catch (e) {
          // a new player's first network fee is paid by the bot; then the very same request goes out again
          if (e instanceof NeedTonError && ton < Attach.claim && api.available() && (await askForGas(provider))) await provider.send(msgs());
          else throw e;
        }
        w.addLocalActivity({ id: `hatch-${ent.root.seq}-${Date.now()}`, kind: 'egg', direction: 'in', amount: cumulative - state.claimed, symbol: 'EGG', decimals: cfg.token.decimals, peer: '', time: Math.floor(Date.now() / 1000), label: 'hatch', failed: false });
        for (let i = 0; i < 30; i++) {
          await sleep(3000);
          if ((await readEgg(masterAddress, provider.address)).claimed >= cumulative) break;
        }
        await w.refresh();
      } catch {
        /* silent: the balance already counts these eggs, and the next round tries again */
      } finally {
        busy.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ton, provider, masterAddress]);
}
