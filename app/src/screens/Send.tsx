import { Cell, toNano } from '@ton/core';
import { useMemo, useState } from 'react';
import { api, apiErrorText } from '../api/server';
import { eggTransfer, parseAddress, tonTransfer, TON_FEE_RESERVE } from '../chain/actions';
import { readEgg, walletInit } from '../chain/egg';
import { cfg } from '../config';
import { formatUnits, parseUnits, shortAddr } from '../lib/format';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Burst } from '../ui/Egg';
import { Check } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';

type Asset = 'EGG' | 'TON';
type Step = 'form' | 'review' | 'sending' | 'done';

const EGG_FEE = toNano('0.1');
const EGG_FEE_CLAIM = toNano('0.15');

export function SendSheet({ onClose }: { onClose: () => void }) {
  const w = useWallet();
  const { provider, data, masterAddress } = w;
  const [asset, setAsset] = useState<Asset>(data.egg || data.pending > 0n ? 'EGG' : 'TON');
  const [to, setTo] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [comment, setComment] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [err, setErr] = useState('');

  const dec = 9;
  const dest = useMemo(() => (to.trim() ? parseAddress(to) : null), [to]);
  const amount = useMemo(() => parseUnits(amountStr, dec), [amountStr]);

  const eggOnChain = data.egg?.balance ?? 0n;
  const eggAvailable = eggOnChain + data.pending;
  const needsClaim = asset === 'EGG' && amount !== null && amount > eggOnChain && data.pending > 0n;
  const attachesClaim = asset === 'EGG' && data.pending > 0n;
  const eggFee = attachesClaim ? EGG_FEE_CLAIM : EGG_FEE;

  const available = asset === 'EGG' ? eggAvailable : data.ton > TON_FEE_RESERVE ? data.ton - TON_FEE_RESERVE : 0n;
  const wrongNet = dest ? dest.testOnly !== (cfg.network === 'testnet') && dest.testOnly : false;
  const isSelf = dest && provider ? dest.address.equals(provider.address) : false;

  const problem = (() => {
    if (to.trim() && !dest) return 'That address doesn’t look right';
    if (wrongNet) return 'This is a testnet address';
    if (isSelf) return 'That’s your own address';
    if (amount === null && amountStr) return 'Enter a valid amount';
    if (amount !== null && amount <= 0n) return 'Amount must be above zero';
    if (amount !== null && amount > available) return asset === 'TON' ? 'Not enough TON (a little is kept for fees)' : 'Not enough EGG';
    if (asset === 'EGG' && amount !== null && data.ton < eggFee) return `You need about ${formatUnits(eggFee, 9, 2)} TON to pay the network fee`;
    return '';
  })();
  const ready = Boolean(dest && amount && amount > 0n && !problem);

  if (!provider) return null;

  const submit = async () => {
    if (!dest || !amount) return;
    setStep('sending');
    setErr('');
    try {
      if (asset === 'TON') {
        await provider.send(tonTransfer({ to: dest, amount, comment: comment.trim() || undefined }));
      } else {
        if (!masterAddress) throw new Error('EGG is not configured');
        const init = await walletInit(masterAddress, provider.address);
        const state = await readEgg(masterAddress, provider.address);
        let claim: Cell | undefined;
        if (attachesClaim) {
          const raw = provider.address.toRawString();
          if (data.me?.address !== raw) await api.link(raw);
          claim = (await api.claim()).claim;
        }
        await provider.send(
          eggTransfer({ owner: provider.address, state, to: dest.address, amount, comment: comment.trim() || undefined, claim, init: init.init }),
        );
      }
      haptic.success();
      setStep('done');
      setTimeout(() => void w.refresh(), 4000);
    } catch (e) {
      haptic.error();
      setErr(e instanceof Error && e.message && !e.message.includes('fetch') ? humanize(e.message) : apiErrorText(e));
      setStep('review');
    }
  };

  if (step === 'done')
    return (
      <Sheet onClose={onClose}>
        <div className="stack center" style={{ alignItems: 'center', gap: 14, position: 'relative', padding: '10px 0 4px' }}>
          <Burst />
          <div className="coin egg" style={{ width: 84, height: 84 }}><Check width={40} height={40} /></div>
          <h2>Sent</h2>
          <p className="muted"><b className="num" style={{ color: 'var(--text)' }}>{amountStr} {asset}</b> is on its way to {dest && shortAddr(dest.address.toString({ bounceable: false }), 5, 5)}.</p>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </Sheet>
    );

  if (step === 'review' || step === 'sending')
    return (
      <Sheet onClose={step === 'sending' ? () => undefined : () => setStep('form')} title="Review">
        <div className="stack">
          <div className="card center">
            <div className="tiny">You send</div>
            <div className="num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>{amountStr} <span style={{ fontSize: 20 }}>{asset}</span></div>
          </div>
          <div className="list">
            <div className="item"><span className="muted">To</span><span className="grow" /><span className="num" style={{ fontWeight: 700 }}>{dest && shortAddr(dest.address.toString({ bounceable: false }), 6, 6)}</span></div>
            {comment && <div className="item"><span className="muted">Comment</span><span className="grow" /><span style={{ fontWeight: 700 }}>{comment}</span></div>}
            <div className="item"><span className="muted">Network fee</span><span className="grow" /><span className="num" style={{ fontWeight: 700 }}>{asset === 'TON' ? '< 0.01' : `≤ ${formatUnits(eggFee, 9, 2)}`} TON</span></div>
          </div>
          {needsClaim && <p className="hint">This also moves {formatUnits(data.pending, 9, 2)} EGG from your nest to your wallet, in the same transaction.</p>}
          {err && <p className="hint bad">{err}</p>}
          <button className="btn primary" onClick={submit} disabled={step === 'sending'}>
            {step === 'sending' ? <><span className="spinner" /> {provider.kind === 'tonconnect' ? 'Confirm in your wallet' : 'Sending'}</> : 'Confirm and send'}
          </button>
        </div>
      </Sheet>
    );

  return (
    <Sheet onClose={onClose} title="Send">
      <div className="stack">
        <div className="seg">
          {(['EGG', 'TON'] as Asset[]).map((a) => (
            <button key={a} className={asset === a ? 'on' : ''} onClick={() => { setAsset(a); setAmountStr(''); haptic.select(); }}>{a}</button>
          ))}
        </div>
        <div className="field">
          <label>Recipient</label>
          <input className={`input ${to.trim() && !dest ? 'err' : ''}`} placeholder="UQ… or EQ… address" value={to} onChange={(e) => setTo(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="field">
          <label>Amount</label>
          <input className="input amount num" inputMode="decimal" placeholder="0" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
          <div className="row" style={{ justifyContent: 'space-between', padding: '0 4px' }}>
            <span className="hint num">Available {formatUnits(available, dec, 4)} {asset}</span>
            <button style={{ color: 'var(--yolk)', fontWeight: 800 }} onClick={() => setAmountStr(formatUnits(available, dec, 9).replace(/ /g, ''))}>Max</button>
          </div>
        </div>
        <div className="field">
          <label>Comment (optional)</label>
          <input className="input" maxLength={120} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {problem && <p className="hint bad">{problem}</p>}
        <button className="btn primary" disabled={!ready} onClick={() => { haptic.tap(); setStep('review'); }}>Continue</button>
      </div>
    </Sheet>
  );
}

function humanize(m: string) {
  if (/reject|denied|cancel/i.test(m)) return 'The transaction was cancelled';
  if (/locked/i.test(m)) return 'The wallet is locked';
  return 'Couldn’t send. Please try again.';
}
