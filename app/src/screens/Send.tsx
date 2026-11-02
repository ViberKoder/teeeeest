import { useEffect, useMemo, useState } from 'react';
import { eggClaim, eggTransfer, parseAddress, ParsedAddress, tonTransfer, TON_FEE_RESERVE } from '../chain/actions';
import { readEgg } from '../chain/egg';
import { loadVerifiedEntitlement } from '../chain/entitlement';
import { cfg } from '../config';
import { formatUnits, parseUnits, shortAddr } from '../lib/format';
import { haptic } from '../lib/tg';
import { NeedTonError } from '../provider/tg';
import { useWallet } from '../state/wallet';
import { Burst, EggMark, TonMark } from '../ui/Egg';
import { Check } from '../ui/Icons';
import { Keypad } from '../ui/Keypad';
import { MainButton, Page, Row, Section } from '../ui/native';
import { Attach } from '@egg/sdk';

type Asset = 'EGG' | 'TON';
type Step = 'to' | 'amount' | 'sending' | 'done';
const dec = 9;
const RECENT = 'egg.recipients.v1';
const recent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/** Telegram-style send: pick who, then an amount screen with its own keypad and a single "Send" button. */
export function SendPage({ onClose }: { onClose: () => void }) {
  const w = useWallet();
  const { provider, data, masterAddress } = w;
  const [asset, setAsset] = useState<Asset>(masterAddress ? 'EGG' : 'TON');
  const [to, setTo] = useState('');
  const [dest, setDest] = useState<ParsedAddress | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [step, setStep] = useState<Step>('to');
  const [err, setErr] = useState('');
  const [past, setPast] = useState<string[]>([]);
  useEffect(() => setPast(recent()), []);

  const parsed = useMemo(() => (to.trim() ? parseAddress(to) : null), [to]);
  const amount = useMemo(() => (amountStr ? parseUnits(amountStr, dec) : null), [amountStr]);
  const eggOnChain = data.egg?.balance ?? 0n;
  // what can leave in ONE request: the tokens already on-chain plus what the contract can credit from the published root
  const available = asset === 'EGG' ? eggOnChain + data.ready : data.ton > TON_FEE_RESERVE ? data.ton - TON_FEE_RESERVE : 0n;

  if (!provider) return null;
  const isSelf = parsed ? parsed.address.equals(provider.address) : false;
  const wrongNet = parsed ? parsed.testOnly && cfg.network !== 'testnet' : false;
  const toProblem = to.trim() && !parsed ? 'This wallet address is invalid.' : isSelf ? 'That’s your own address.' : wrongNet ? 'This is a testnet address.' : '';
  const amountProblem = (() => {
    if (!amount || amount <= 0n) return '';
    if (amount > available) return 'Insufficient funds.';
    return '';
  })();

  const pickRecipient = (p: ParsedAddress) => {
    setDest(p);
    setStep('amount');
    haptic.tap();
  };

  const paste = async () => {
    try {
      setTo((await navigator.clipboard.readText()).trim());
    } catch {
      /* clipboard blocked: the field still takes typing */
    }
  };

  const submit = async () => {
    if (!dest || !amount) return;
    setStep('sending');
    setErr('');
    try {
      if (asset === 'TON') {
        await provider.send(tonTransfer({ to: dest, amount, comment: comment.trim() || undefined }));
      } else {
        if (!masterAddress) throw new Error('EGG is not configured');
        const note = comment.trim() || undefined;
        if (data.ready > 0n) {
          // claim what the blockchain has committed AND send, in a single signed request
          const v = await loadVerifiedEntitlement(provider, masterAddress, data.me?.address === provider.address.toRawString());
          if (v.cumulative > v.state.claimed) {
            await provider.send(eggClaim({
              state: v.state, epoch: v.ent.epoch, cumulative: v.cumulative, proof: v.proof, init: v.init.init,
              thenSend: { owner: provider.address, to: dest.address, amount, comment: note },
            }));
          } else {
            await provider.send(eggTransfer({ owner: provider.address, state: v.state, to: dest.address, amount, comment: note }));
          }
        } else {
          const state = await readEgg(masterAddress, provider.address);
          await provider.send(eggTransfer({ owner: provider.address, state, to: dest.address, amount, comment: note }));
        }
      }
      try {
        const raw = dest.address.toString({ bounceable: false });
        localStorage.setItem(RECENT, JSON.stringify([raw, ...recent().filter((x) => x !== raw)].slice(0, 5)));
      } catch {
        /* private mode */
      }
      haptic.success();
      setStep('done');
      setTimeout(() => void w.refresh(), 5000);
    } catch (e) {
      haptic.error();
      const m = e instanceof Error ? e.message : '';
      setErr(
        e instanceof NeedTonError
          ? `Your wallet needs about ${formatUnits(Attach.transfer, 9, 2)} TON for the network fee.`
          : /reject|denied|cancel/i.test(m) ? 'The transfer was cancelled.' : 'The transfer could not be sent. Check the balance and network connection, then try again.',
      );
      setStep('amount');
    }
  };

  // ----- done -----
  if (step === 'done')
    return (
      <Page onBack={onClose} bottomSpace>
        <div className="stack center" style={{ alignItems: 'center', gap: 14, position: 'relative', paddingTop: 48 }}>
          <Burst />
          <div className="row-icon icon-in" style={{ width: 88, height: 88 }}><Check width={44} height={44} /></div>
          <h2 style={{ margin: 0, fontSize: 26 }}>Sent</h2>
          <p className="hint" style={{ fontSize: 16 }}>
            <b className="num" style={{ color: 'var(--text)' }}>{amountStr} {asset}</b> have been sent to {dest && shortAddr(dest.address.toString({ bounceable: false }), 5, 5)}.
          </p>
        </div>
        <MainButton text="Done" onClick={onClose} />
      </Page>
    );

  // ----- amount -----
  if (step === 'amount' || step === 'sending') {
    const len = (amountStr || '0').length;
    const size = len <= 5 ? 68 : len <= 8 ? 54 : len <= 11 ? 42 : 34;
    return (
      <Page title={`Send ${asset}`} onBack={step === 'sending' ? () => undefined : () => setStep('to')} bottomSpace>
        <div className="recipient-chip">
          <span className="row-icon icon-soft"><Check width={18} height={18} /></span>
          <div className="meta"><b>Recipient</b><span className="num">{dest && shortAddr(dest.address.toString({ bounceable: false }), 8, 8)}</span></div>
        </div>

        <div className="amount-hero">
          <div className={`val num ${amountStr ? '' : 'empty'}`} style={{ fontSize: size }}>
            {amountStr || '0'}<span className="u">{asset}</span>
          </div>
          <div className="bal-line num">
            Balance: {formatUnits(available, dec, 4)} {asset}
            <button onClick={() => setAmountStr(formatUnits(available, dec, 9).replace(/ /g, ''))}>Max</button>
          </div>
          {asset === 'EGG' && data.accruing > 0n && <div className="hint" style={{ marginTop: 6, padding: '0 20px' }}>{formatUnits(data.accruing, dec, 2)} EGG more are being committed to the blockchain and can be sent in a minute.</div>}
          {amountProblem && <div className="hint bad" style={{ marginTop: 6 }}>{amountProblem}</div>}
          {err && <div className="hint bad" style={{ marginTop: 6, padding: '0 20px' }}>{err}</div>}
        </div>

        {masterAddress && (
          <div className="seg" style={{ margin: '4px 0 6px' }}>
            {(['EGG', 'TON'] as Asset[]).map((a) => (
              <button key={a} className={asset === a ? 'on' : ''} onClick={() => { setAsset(a); setAmountStr(''); haptic.select(); }}>{a}</button>
            ))}
          </div>
        )}

        <Section footer={<span className="num">Network fee: {asset === 'TON' ? '< 0.01' : '≈ 0.01'} TON</span>}>
          {showComment ? (
            <div className="field"><label>Comment</label><input className="input" maxLength={120} autoFocus value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          ) : (
            <Row onClick={() => setShowComment(true)} title={<span style={{ color: 'var(--accent-text)' }}>Add comment</span>} />
          )}
        </Section>

        <Keypad value={amountStr} onChange={setAmountStr} decimals={dec} />
        <MainButton
          text={amount && amount > 0n ? `Send ${amountStr} ${asset}` : 'Enter an amount'}
          enabled={Boolean(amount && amount > 0n && !amountProblem)}
          loading={step === 'sending'}
          onClick={submit}
        />
      </Page>
    );
  }

  // ----- recipient -----
  return (
    <Page title="Send Money to" onBack={onClose} bottomSpace>
      <Section>
        <div className="field">
          <label>Wallet address</label>
          <input className="input" placeholder="UQ… or EQ…" value={to} onChange={(e) => setTo(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <button className="paste" onClick={paste}>Paste from clipboard</button>
      </Section>
      {toProblem && <p className="hint bad" style={{ padding: '8px 16px 0' }}>{toProblem}</p>}

      <Section title="Recent recipients">
        {past.length === 0 ? (
          <div className="empty">Recent recipients<br />will appear here</div>
        ) : (
          past.map((a) => {
            const p = parseAddress(a);
            return p ? <Row key={a} onClick={() => pickRecipient(p)} icon={<span className={`row-icon ${asset === 'EGG' ? 'icon-egg' : 'icon-ton'}`}>{asset === 'EGG' ? <EggMark /> : <TonMark />}</span>} title={<span className="num">{shortAddr(a, 6, 6)}</span>} subtitle="TON address" /> : null;
          })
        )}
      </Section>
      <MainButton text="Continue" enabled={Boolean(parsed && !toProblem)} onClick={() => parsed && pickRecipient(parsed)} />
    </Page>
  );
}
