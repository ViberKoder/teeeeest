import { Address } from '@ton/core';
import { Attach, verifyEntitlement } from '@egg/sdk';
import { useState } from 'react';
import { api, apiErrorText, entitlementCache, proofCell } from '../api/server';
import { eggClaim } from '../chain/actions';
import { onchainCommitment, readEgg, walletInit } from '../chain/egg';
import { cfg } from '../config';
import { formatUnits } from '../lib/format';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Burst } from '../ui/Egg';
import { FRAMES } from '../lib/sticker';
import { Sticker, StickerMode } from '../ui/Sticker';
import { MainButton, Page } from '../ui/native';
import { NeedTonError } from '../provider/tg';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = 'idle' | 'working' | 'done' | 'error';

/**
 * Claiming never trusts the server. The proof it returns is opened locally and compared with the commitment
 * the minter contract stores for that epoch; only if both agree is a transaction sent. The wallet contract then
 * asks the minter to verify the same proof on-chain before it credits anything.
 */
export function ClaimPage({ onClose }: { onClose: (hatched?: boolean) => void }) {
  const w = useWallet();
  const { provider, data, masterAddress } = w;
  const [status, setStatus] = useState<Status>('idle');
  const [step, setStep] = useState(0);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [moved, setMoved] = useState(0n);
  if (!provider || !masterAddress) return null;

  const sponsored = (data.me?.sponsored_left ?? 0) > 0;
  const lowTon = data.ton < Attach.claim && !sponsored;
  const mode: StickerMode =
    status === 'working' ? { kind: 'loop', from: FRAMES.egg, to: FRAMES.cracked, speed: 1.4 }
    : status === 'done' ? { kind: 'play', from: FRAMES.cracked, to: FRAMES.hatched + 8 }
    : { kind: 'still', frame: FRAMES.egg };

  const run = async () => {
    setStatus('working');
    setErr('');
    setMoved(data.ready);
    try {
      const raw = provider.address.toRawString();
      setStep(1);
      if (data.me?.address !== raw) await provider.linkToAccount();
      const ent = await api.entitlement(raw).catch((e: unknown) => {
        const cached = entitlementCache.read(raw);
        if (cached) return cached; // the server is unreachable, but a verified proof is still good
        throw e;
      });
      const commitment = await onchainCommitment(masterAddress, ent.epoch);
      if (!commitment) throw new Error('epoch-not-on-chain');
      if (!verifyEntitlement(ent, commitment)) throw new Error('proof-mismatch');
      entitlementCache.write(ent);
      setEpoch(ent.epoch);

      const cumulative = BigInt(ent.cumulative);
      const [state, init] = await Promise.all([readEgg(masterAddress, provider.address), walletInit(masterAddress, provider.address)]);
      if (cumulative <= state.claimed) throw new Error('already-claimed');
      setMoved(cumulative - state.claimed);

      setStep(2);
      await provider.send(eggClaim({ state, epoch: ent.epoch, cumulative, proof: proofCell(ent), init: init.init }));
      w.addLocalActivity({ id: `hatch-${ent.epoch}-${Date.now()}`, kind: 'egg', direction: 'in', amount: cumulative - state.claimed, symbol: 'EGG', decimals: cfg.token.decimals, peer: '', time: Math.floor(Date.now() / 1000), label: 'hatch', failed: false });

      setStep(3);
      for (let i = 0; i < 40; i++) {
        await sleep(3000);
        const s = await readEgg(masterAddress, Address.parse(provider.address.toString()));
        if (s.claimed >= cumulative) break;
      }
      await w.refresh();
      haptic.success();
      setStatus('done');
    } catch (e) {
      haptic.error();
      const m = e instanceof Error ? e.message : '';
      setErr(
        m === 'proof-mismatch'
          ? 'The server’s answer does not match the blockchain, so nothing was sent.'
          : m === 'epoch-not-on-chain'
            ? 'That update is not on the blockchain yet. Try again in a minute.'
            : m === 'already-claimed'
              ? 'Everything committed so far is already in your wallet.'
              : e instanceof NeedTonError
                ? 'Your free hatches are used up. Add about 0.1 TON to your wallet to cover the network fee.'
                : /reject|denied|cancel/i.test(m)
                  ? 'The transaction was cancelled.'
                  : apiErrorText(e),
      );
      setStatus('error');
    }
  };

  const steps = ['Checking the proof against the blockchain', 'Signing your request', 'Moving EGG to your wallet'];

  return (
    <Page title={status === 'done' ? undefined : 'Hatch'} onBack={status === 'working' ? () => undefined : () => onClose(status === 'done')} bottomSpace>
      <div className="stack" style={{ alignItems: 'center', gap: 14, position: 'relative', paddingTop: 18, textAlign: 'center' }}>
        {status === 'done' && <Burst />}
        <Sticker mode={mode} size={168} />

        {status === 'done' ? (
          <>
            <h2 style={{ margin: 0, fontSize: 26 }}>Hatched!</h2>
            <p className="hint" style={{ fontSize: 16 }}>
              <b className="num" style={{ color: 'var(--text)' }}>{formatUnits(moved, cfg.token.decimals, 2)} EGG</b> are now in your wallet, verified by the blockchain{epoch ? ` (update #${epoch})` : ''}.
            </p>
          </>
        ) : status === 'working' ? (
          <div className="steps" style={{ marginTop: 10 }}>
            {steps.map((t, i) => (
              <div key={t} className={`step ${step === i + 1 ? 'on' : ''} ${step > i + 1 ? 'done' : ''}`}>
                <i>{step > i + 1 ? '✓' : i + 1}</i>
                {t}
              </div>
            ))}
          </div>
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 26 }}><span className="num">{formatUnits(data.ready, cfg.token.decimals, 2)}</span> EGG ready</h2>
            <p className="hint" style={{ fontSize: 16, maxWidth: 330 }}>
              Your amount is committed in a public root on the blockchain. Hatching asks the token contract itself to verify your proof — the server cannot take it back or change it.
            </p>
            {sponsored && data.ton < Attach.claim && <p className="hint" style={{ color: 'var(--good)' }}>This one is on us — we cover the network fee for your first hatches.</p>}
            {lowTon && <p className="hint bad">You need about {formatUnits(Attach.claim, 9, 2)} TON for the network fee; you have {formatUnits(data.ton, 9, 3)}.</p>}
            {status === 'error' && <p className="hint bad">{err}</p>}
          </>
        )}
      </div>

      {status === 'done' ? (
        <MainButton text="Done" onClick={() => onClose(true)} />
      ) : (
        <MainButton text={status === 'error' ? 'Try again' : 'Hatch to my wallet'} onClick={run} enabled={!lowTon} loading={status === 'working'} />
      )}
    </Page>
  );
}
