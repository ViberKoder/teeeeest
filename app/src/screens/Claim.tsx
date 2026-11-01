import { Address, toNano } from '@ton/core';
import { useState } from 'react';
import { api, apiErrorText } from '../api/server';
import { eggClaim } from '../chain/actions';
import { readEgg, walletInit } from '../chain/egg';
import { cfg } from '../config';
import { formatUnits } from '../lib/format';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Burst, Egg, EggState } from '../ui/Egg';
import { Sheet } from '../ui/Sheet';

const NEED_TON = toNano('0.12');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = 'idle' | 'working' | 'done' | 'error';

export function ClaimSheet({ onClose }: { onClose: () => void }) {
  const w = useWallet();
  const { provider, data, masterAddress } = w;
  const [status, setStatus] = useState<Status>('idle');
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  const [moved, setMoved] = useState(0n);
  if (!provider || !masterAddress) return null;

  const lowTon = data.ton < NEED_TON;
  const egg: EggState = status === 'working' ? 'cracking' : status === 'done' ? 'hatched' : 'idle';

  const run = async () => {
    setStatus('working');
    setErr('');
    setMoved(data.pending);
    try {
      const raw = provider.address.toRawString();
      if (data.me?.address !== raw) {
        setStep('Linking your wallet…');
        await api.link(raw);
      }
      setStep('Getting your eggs ready…');
      const { claim, cumulative } = await api.claim();
      const [state, init] = await Promise.all([readEgg(masterAddress, provider.address), walletInit(masterAddress, provider.address)]);
      setStep(provider.kind === 'tonconnect' ? 'Confirm in your wallet…' : 'Sending…');
      await provider.send(eggClaim({ state, claim, init: init.init }));

      setStep('Waiting for the network…');
      for (let i = 0; i < 30; i++) {
        await sleep(3000);
        const s = await readEgg(masterAddress, Address.parse(provider.address.toString()));
        if (s.claimed >= cumulative) break;
      }
      await w.refresh();
      haptic.success();
      setStatus('done');
    } catch (e) {
      haptic.error();
      setErr(apiErrorText(e));
      setStatus('error');
    }
  };

  return (
    <Sheet onClose={status === 'working' ? () => undefined : onClose}>
      <div className="stack center" style={{ alignItems: 'center', gap: 14, position: 'relative', paddingTop: 6 }}>
        {status === 'done' && <Burst />}
        <Egg size={104} state={egg} float={status === 'idle'} />
        {status === 'done' ? (
          <>
            <h2>Hatched!</h2>
            <p className="muted"><b className="num" style={{ color: 'var(--text)' }}>{formatUnits(moved, cfg.token.decimals, 2)}</b> EGG is yours, on-chain.</p>
            <button className="btn primary" onClick={onClose}>Nice</button>
          </>
        ) : status === 'working' ? (
          <>
            <h2>Hatching…</h2>
            <p className="muted">{step}</p>
          </>
        ) : (
          <>
            <h2><span className="num">{formatUnits(data.pending, cfg.token.decimals, 2)}</span> EGG in the nest</h2>
            <p className="muted" style={{ maxWidth: 320 }}>
              These are earned but still off-chain. Moving them costs one small network fee (about 0.05 TON), and they become ordinary tokens in your wallet.
            </p>
            {lowTon && <p className="hint bad">You need about {formatUnits(NEED_TON, 9, 2)} TON for the network fee. You have {formatUnits(data.ton, 9, 3)}.</p>}
            {status === 'error' && <p className="hint bad">{err}</p>}
            <button className="btn primary" disabled={lowTon} onClick={run}>{status === 'error' ? 'Try again' : 'Move to my wallet'}</button>
                      </>
        )}
      </div>
    </Sheet>
  );
}
