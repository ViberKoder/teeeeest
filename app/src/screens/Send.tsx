import { useMemo, useState } from 'react';
import { apiErrorText } from '../api/server';
import { eggTransfer, parseAddress, tonTransfer, TON_FEE_RESERVE } from '../chain/actions';
import { readEgg } from '../chain/egg';
import { cfg } from '../config';
import { formatUnits, parseUnits, shortAddr } from '../lib/format';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Burst } from '../ui/Egg';
import { Check } from '../ui/Icons';
import { MainButton, Page, Row, Section } from '../ui/native';
import { Attach } from '@egg/sdk';

type Asset = 'EGG' | 'TON';
type Step = 'form' | 'review' | 'sending' | 'done';
const dec = 9;

export function SendPage({ onClose }: { onClose: () => void }) {
  const w = useWallet();
  const { provider, data, masterAddress } = w;
  const [asset, setAsset] = useState<Asset>(masterAddress && data.egg && data.egg.balance > 0n ? 'EGG' : 'TON');
  const [to, setTo] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [comment, setComment] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [err, setErr] = useState('');

  const dest = useMemo(() => (to.trim() ? parseAddress(to) : null), [to]);
  const amount = useMemo(() => parseUnits(amountStr, dec), [amountStr]);
  const eggOnChain = data.egg?.balance ?? 0n;
  const available = asset === 'EGG' ? eggOnChain : data.ton > TON_FEE_RESERVE ? data.ton - TON_FEE_RESERVE : 0n;
  const nestHint = asset === 'EGG' && data.ready > 0n;
  const isSelf = dest && provider ? dest.address.equals(provider.address) : false;
  const wrongNet = dest ? dest.testOnly && cfg.network !== 'testnet' : false;

  const problem = (() => {
    if (to.trim() && !dest) return 'That address doesn’t look right';
    if (wrongNet) return 'This is a testnet address';
    if (isSelf) return 'That’s your own address';
    if (amount === null && amountStr) return 'Enter a valid amount';
    if (amount !== null && amount <= 0n) return 'Amount must be above zero';
    if (amount !== null && amount > available) return asset === 'TON' ? 'Not enough TON (a little is kept for fees)' : 'Not enough EGG in your wallet';
    if (asset === 'EGG' && amount !== null && data.ton < Attach.transfer) return `You need about ${formatUnits(Attach.transfer, 9, 2)} TON to pay the network fee`;
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
        const state = await readEgg(masterAddress, provider.address);
        await provider.send(eggTransfer({ owner: provider.address, state, to: dest.address, amount, comment: comment.trim() || undefined }));
      }
      haptic.success();
      setStep('done');
      setTimeout(() => void w.refresh(), 4000);
    } catch (e) {
      haptic.error();
      const m = e instanceof Error ? e.message : '';
      setErr(/reject|denied|cancel/i.test(m) ? 'The transaction was cancelled' : /locked/i.test(m) ? 'The wallet is locked' : apiErrorText(e));
      setStep('review');
    }
  };

  if (step === 'done')
    return (
      <Page onBack={onClose} bottomSpace>
        <div className="stack center" style={{ alignItems: 'center', gap: 14, position: 'relative', paddingTop: 40 }}>
          <Burst />
          <div className="row-icon icon-in" style={{ width: 84, height: 84 }}><Check width={42} height={42} /></div>
          <h2 style={{ margin: 0, fontSize: 26 }}>Sent</h2>
          <p className="hint" style={{ fontSize: 16 }}>
            <b className="num" style={{ color: 'var(--text)' }}>{amountStr} {asset}</b> is on its way to {dest && shortAddr(dest.address.toString({ bounceable: false }), 5, 5)}.
          </p>
        </div>
        <MainButton text="Done" onClick={onClose} />
      </Page>
    );

  if (step === 'review' || step === 'sending')
    return (
      <Page title="Confirm" onBack={step === 'sending' ? () => undefined : () => setStep('form')} bottomSpace>
        <div className="balance" style={{ paddingTop: 10 }}>
          <div className="label">You send</div>
          <div className="amount num">{amountStr}<small>{asset}</small></div>
        </div>
        <Section>
          <Row title={<span className="hint" style={{ fontSize: 17 }}>To</span>} trailing={<span className="num">{dest && shortAddr(dest.address.toString({ bounceable: false }), 6, 6)}</span>} />
          {comment && <Row title={<span className="hint" style={{ fontSize: 17 }}>Comment</span>} trailing={comment} />}
          <Row title={<span className="hint" style={{ fontSize: 17 }}>Network fee</span>} trailing={<span className="num">{asset === 'TON' ? '< 0.01' : '≈ 0.01'} TON</span>} />
        </Section>
        {err && <p className="hint bad center" style={{ marginTop: 14 }}>{err}</p>}
        <MainButton text="Confirm and send" onClick={submit} loading={step === 'sending'} />
      </Page>
    );

  return (
    <Page title="Send" onBack={onClose} bottomSpace>
      {masterAddress && <div className="seg" style={{ marginTop: 6 }}>
        {(['EGG', 'TON'] as Asset[]).map((a) => (
          <button key={a} className={asset === a ? 'on' : ''} onClick={() => { setAsset(a); setAmountStr(''); haptic.select(); }}>{a}</button>
        ))}
      </div>}

      <Section>
        <div className="amount-box">
          <input className="num" inputMode="decimal" placeholder="0" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
          <div className="unit num">Available {formatUnits(available, dec, 4)} {asset}</div>
          <button className="max" onClick={() => setAmountStr(formatUnits(available, dec, 9).replace(/ /g, ''))}>Use max</button>
        </div>
      </Section>
      {nestHint && <p className="hint" style={{ padding: '8px 16px 0' }}>{formatUnits(data.ready, 9, 2)} more EGG are ready in the nest — hatch them first to send them.</p>}

      <Section>
        <div className="field">
          <label>Recipient</label>
          <input className="input" placeholder="UQ… or EQ… address" value={to} onChange={(e) => setTo(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <div className="field">
          <label>Comment (optional)</label>
          <input className="input" maxLength={120} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </Section>
      {problem && <p className="hint bad" style={{ padding: '8px 16px 0' }}>{problem}</p>}
      <MainButton text="Continue" enabled={ready} onClick={() => { haptic.tap(); setStep('review'); }} />
    </Page>
  );
}
