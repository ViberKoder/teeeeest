import { Address } from '@ton/core';
import { Attach } from '@egg/sdk';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/server';
import { eggClaim, eggTransfer, parseAddress, ParsedAddress, tonTransfer, TON_FEE_RESERVE, USERNAME_EGG_FORWARD, USERNAME_RE } from '../chain/actions';
import { askForGas } from '../chain/gas';
import { readEgg } from '../chain/egg';
import { loadVerifiedEntitlement } from '../chain/entitlement';
import { cfg } from '../config';
import { formatUnits, parseUnits, shortAddr } from '../lib/format';
import { haptic, scanQr, shareLink } from '../lib/tg';
import { useApi } from '../lib/useApi';
import { playerName, hueOf } from '../lib/league';
import { NeedTonError } from '../provider/tg';
import { Asset } from '../state/nav';
import { useWallet } from '../state/wallet';
import { Burst } from '../ui/Egg';
import { EggCoin } from '../ui/EggCoin';
import { GramCoin, GramGlyph } from '../ui/Gram';
import { Back, Check, Paste, Scan } from '../ui/Icons';
import { Keypad } from '../ui/Keypad';
import { MainButton } from '../ui/native';
import { Sheet } from '../ui/Sheet';

type Step = 'to' | 'amount' | 'review' | 'sending' | 'done';
const dec = 9;
const RECENT = 'egg.recipients.v1';
const recent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]') as string[]; } catch { return []; }
};
const Avatar = ({ seed, children }: { seed: string; children: React.ReactNode }) => (
  <span className="avatar" style={{ ['--h' as string]: hueOf(seed) }}>{children}</span>
);

/** Send: who → how much → a last look → done. One sheet, one action at a time, the way Telegram's own wallet does it. */
export function SendSheet({ onClose, asset: start, initialTo, initialAmount }: { onClose: () => void; asset?: Asset; initialTo?: string; initialAmount?: string }) {
  const w = useWallet();
  const { provider, data, masterAddress } = w;
  const eggOn = Boolean(masterAddress);
  const [asset, setAsset] = useState<Asset>(start ?? (eggOn ? 'EGG' : 'Gram'));
  const [to, setTo] = useState(initialTo ?? '');
  const [dest, setDest] = useState<ParsedAddress | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState(/^\d+(\.\d{1,9})?$/.test(initialAmount ?? '') ? initialAmount! : '');
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [step, setStep] = useState<Step>('to');
  const [err, setErr] = useState('');
  const [past, setPast] = useState<string[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [preparedFor, setPreparedFor] = useState(false);
  const friends = useApi(() => (api.available() ? api.friends() : Promise.reject(new Error('offline'))), []);
  useEffect(() => setPast(recent()), []);
  useEffect(() => {
    const t = (initialTo ?? '').trim();
    if (!t) return;
    if (USERNAME_RE.test(t) && api.available()) void pickHandle(t);
    else { const p = parseAddress(t); if (p) pickRecipient(p); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typed = to.trim();
  const isHandle = typed.startsWith('@');
  const handleOk = isHandle && USERNAME_RE.test(typed) && api.available();
  const parsed = useMemo(() => (typed && !isHandle ? parseAddress(to) : null), [to, typed, isHandle]);
  const amount = useMemo(() => (amountStr ? parseUnits(amountStr, dec) : null), [amountStr]);
  const eggOnChain = data.egg?.balance ?? 0n;
  // what can leave in ONE request: tokens already on-chain plus what the contract can credit from the published root
  const available = asset === 'EGG' ? eggOnChain + data.ready : data.ton > TON_FEE_RESERVE ? data.ton - TON_FEE_RESERVE : 0n;

  if (!provider) return null;
  const isSelf = parsed ? parsed.address.equals(provider.address) : false;
  const wrongNet = parsed ? parsed.testOnly && cfg.network !== 'testnet' : false;
  const toProblem = isHandle
    ? !USERNAME_RE.test(typed) ? 'That @username is not valid.' : !api.available() ? 'Sending to a @username works inside Telegram.' : ''
    : typed && !parsed ? 'This wallet address is invalid.' : isSelf ? 'That’s your own address.' : wrongNet ? 'This is a testnet address.' : '';
  const amountProblem = amount && amount > 0n && amount > available ? 'Insufficient funds' : '';
  const canReview = Boolean(amount && amount > 0n && !amountProblem);

  const pickRecipient = (p: ParsedAddress) => { setHandle(null); setDest(p); setStep('amount'); haptic.tap(); };
  const pickHandle = async (h: string) => {
    setLookingUp(true);
    setErr('');
    try {
      const r = await api.walletFor(h);
      setHandle(h.toLowerCase().replace(/^@/, ''));
      setPreparedFor(!r.ready);
      setDest({ address: Address.parseRaw(r.address), bounceable: false, testOnly: cfg.network === 'testnet' });
      setStep('amount');
      haptic.tap();
    } catch {
      haptic.error();
      setErr('Could not look that username up. Check your connection and try again.');
    } finally {
      setLookingUp(false);
    }
  };
  const paste = async () => { try { setTo((await navigator.clipboard.readText()).trim()); } catch { /* clipboard blocked */ } };
  const scan = async () => {
    const t = await scanQr();
    if (!t) return;
    const m = /(?:ton:\/\/transfer\/)?([A-Za-z0-9_-]{48})/.exec(t);
    setTo((m ? m[1] : t).trim());
  };

  const submit = async (retried = false): Promise<void> => {
    if (!dest || !amount) return;
    setStep('sending');
    setErr('');
    try {
      if (asset === 'Gram') {
        await provider.send(tonTransfer({ to: dest, amount, comment: comment.trim() || undefined }));
      } else {
        if (!masterAddress) throw new Error('EGG is not configured');
        const note = comment.trim() || undefined;
        // a prepared wallet has no Gram yet: a little travels with the EGG so it can accept the key change on its owner's first visit
        const forwardTon = preparedFor ? USERNAME_EGG_FORWARD : undefined;
        if (data.ready > 0n) {
          // anything the blockchain has committed for you is credited AND sent in a single signed request: no extra step, no waiting
          const v = await loadVerifiedEntitlement(provider, masterAddress, data.me?.address === provider.address.toRawString());
          if (v.cumulative > v.state.claimed) {
            await provider.send(eggClaim({ state: v.state, cumulative: v.cumulative, proof: v.proof, root: v.root, init: v.init.init, thenSend: { owner: provider.address, to: dest.address, amount, comment: note, forwardTon } }));
          } else {
            await provider.send(eggTransfer({ owner: provider.address, state: v.state, to: dest.address, amount, comment: note, forwardTon }));
          }
        } else {
          const state = await readEgg(masterAddress, provider.address);
          await provider.send(eggTransfer({ owner: provider.address, state, to: dest.address, amount, comment: note, forwardTon }));
        }
      }
      try {
        const raw = handle ? '@' + handle : dest.address.toString({ bounceable: false });
        localStorage.setItem(RECENT, JSON.stringify([raw, ...recent().filter((x) => x !== raw)].slice(0, 6)));
      } catch { /* private mode */ }
      haptic.success();
      setStep('done');
      setTimeout(() => void w.refresh(), 5000);
    } catch (e) {
      if (e instanceof NeedTonError && !retried && (await askForGas(provider))) return submit(true);
      haptic.error();
      const m = e instanceof Error ? e.message : '';
      setErr(
        e instanceof NeedTonError
          ? `Your wallet needs about ${formatUnits(Attach.transfer, 9, 2)} Gram for the network fee.`
          : /reject|denied|cancel/i.test(m) ? 'The transfer was cancelled.' : 'The transfer could not be sent. Check the balance and network connection, then try again.',
      );
      setStep('review');
    }
  };

  const who = handle ? `@${handle}` : dest ? shortAddr(dest.address.toString({ bounceable: false }), 5, 5) : '';
  const feeText = asset === 'Gram' ? '< 0.01' : preparedFor ? '≈ 0.07' : '≈ 0.01';
  const Coin = ({ size }: { size: number }) => (asset === 'EGG' ? <EggCoin size={size} /> : <GramCoin size={size} />);
  const fmtAmt = `${amountStr || '0'}`;

  // ---------------------------------------------------------------- done
  if (step === 'done')
    return (
      <Sheet onClose={onClose} title="Sent" footer={handle ? (
        <MainButton inline text={`Tell @${handle}`} onClick={() => shareLink(`https://t.me/${cfg.bot}?start=claim`, `I sent you ${fmtAmt} ${asset} in the Egg wallet — open it to collect.`)} />
      ) : <MainButton inline text="Done" onClick={onClose} />}>
        <div className="done-pane">
          <Burst />
          <div className="done-art"><Coin size={96} /><span className="done-check"><Check width={22} height={22} /></span></div>
          <h2>{fmtAmt} {asset}</h2>
          <p>{handle ? <>is now in the wallet of <b>@{handle}</b>.{preparedFor ? ' They have not opened the wallet yet — it is waiting for them, and becomes theirs alone the moment they do.' : ''}</> : <>has been sent to <b className="num">{who}</b>.</>}</p>
          {handle && <button className="link-btn" onClick={onClose}>Done</button>}
        </div>
      </Sheet>
    );

  // ---------------------------------------------------------------- review
  if (step === 'review' || step === 'sending')
    return (
      <Sheet onClose={step === 'sending' ? () => undefined : onClose} onBack={step === 'sending' ? () => undefined : () => setStep('amount')} left={<button className="sheet-back-btn" onClick={() => step !== 'sending' && setStep('amount')} aria-label="Back"><Back width={20} height={20} /></button>} title="Confirm"
        footer={<MainButton inline text={`Send ${fmtAmt} ${asset}`} loading={step === 'sending'} onClick={() => void submit()} />}>
        <div className="review-hero">
          <Coin size={72} />
          <div className="review-amt num">−{fmtAmt}<span>{asset === 'Gram' ? <GramGlyph size={22} /> : 'EGG'}</span></div>
        </div>
        <div className="card list-card">
          <div className="kv"><span>To</span><b className="num">{who}</b></div>
          {handle && dest && <div className="kv"><span>Address</span><b className="num">{shortAddr(dest.address.toString({ bounceable: false }), 5, 5)}</b></div>}
          <div className="kv"><span>Network fee</span><b className="num">{feeText} Gram</b></div>
          {comment.trim() && <div className="kv"><span>Comment</span><b>{comment.trim()}</b></div>}
        </div>
        {asset === 'EGG' && data.ready > 0n && <p className="foot-note">Eggs that were just committed to the blockchain move together with this transfer.</p>}
        {preparedFor && <p className="foot-note">This person has not opened the wallet yet. A little Gram goes with the transfer so their new wallet can be set up.</p>}
        {err && <p className="foot-note bad">{err}</p>}
      </Sheet>
    );

  // ---------------------------------------------------------------- amount
  if (step === 'amount') {
    const len = (amountStr || '0').length;
    const size = len <= 5 ? 64 : len <= 8 ? 52 : len <= 11 ? 40 : 32;
    return (
      <Sheet onClose={onClose} onBack={() => setStep('to')} left={<button className="sheet-back-btn" onClick={() => setStep('to')} aria-label="Back"><Back width={20} height={20} /></button>} title="Send"
        footer={<MainButton inline text={canReview ? 'Continue' : 'Enter an amount'} enabled={canReview} onClick={() => setStep('review')} />}>
        <div className="to-pill">
          <Avatar seed={who}>{handle ? handle[0].toUpperCase() : '#'}</Avatar>
          <span><small>To</small><b className="num">{who}</b></span>
          <button onClick={() => setStep('to')}>Change</button>
        </div>
        {eggOn && (
          <div className="asset-seg" role="tablist">
            {(['EGG', 'Gram'] as Asset[]).map((a) => (
              <button key={a} className={asset === a ? 'on' : ''} onClick={() => { setAsset(a); setAmountStr(''); haptic.select(); }}>
                {a === 'EGG' ? <EggCoin size={22} /> : <GramCoin size={22} />}{a}
              </button>
            ))}
          </div>
        )}
        <div className="amount-hero2">
          <div className={`val num ${amountStr ? '' : 'empty'}`} style={{ fontSize: size }}>{amountStr || '0'}<span className="u">{asset}</span></div>
          <div className={`bal-line num ${amountProblem ? 'bad' : ''}`}>
            {amountProblem || `Balance ${formatUnits(available, dec, 4)} ${asset}`}
            {!amountProblem && <button onClick={() => setAmountStr(formatUnits(available, dec, 9).replace(/\s/g, ''))}>Max</button>}
          </div>
          {asset === 'EGG' && data.accruing > 0n && <div className="foot-note">{formatUnits(data.accruing, dec, 2)} EGG more are being committed to the blockchain and can be sent in a minute.</div>}
          {err && <div className="foot-note bad">{err}</div>}
        </div>
        <div className="comment-row">
          {showComment ? <input className="input" maxLength={120} autoFocus placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} /> : <button onClick={() => setShowComment(true)}>Add a comment</button>}
        </div>
        <Keypad value={amountStr} onChange={setAmountStr} decimals={dec} />
      </Sheet>
    );
  }

  // ---------------------------------------------------------------- recipient
  const named = (friends.data?.friends ?? []).filter((f) => f.username).slice(0, 8);
  return (
    <Sheet onClose={onClose} title="Send to" footer={<MainButton inline text="Continue" enabled={Boolean((parsed || handleOk) && !toProblem)} loading={lookingUp} onClick={() => (handleOk ? void pickHandle(typed) : parsed && pickRecipient(parsed))} />}>
      <div className="field-card">
        <input className="input big" placeholder="@username or wallet address" value={to} onChange={(e) => setTo(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <div className="field-tools">
          <button onClick={paste}><Paste width={18} height={18} />Paste</button>
          <button onClick={scan}><Scan width={18} height={18} />Scan</button>
        </div>
      </div>
      {(toProblem || err) && <p className="foot-note bad">{toProblem || err}</p>}

      {named.length > 0 && (
        <>
          <h4 className="sec-t">Friends</h4>
          <div className="chip-row">
            {named.map((f) => (
              <button key={f.tag} className="friend-chip" onClick={() => void pickHandle(`@${f.username}`)}>
                <Avatar seed={f.username!}>{f.username![0].toUpperCase()}</Avatar>
                <span>{playerName(f).replace('@', '')}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h4 className="sec-t">Recent</h4>
      <div className="card list-card">
        {past.length === 0 ? (
          <div className="empty-mini">Recent recipients will appear here</div>
        ) : (
          past.map((a) => {
            if (USERNAME_RE.test(a)) return <button key={a} className="pick" onClick={() => void pickHandle(a)}><Avatar seed={a}>{a[1].toUpperCase()}</Avatar><span><b>{a}</b><small>Telegram username</small></span></button>;
            const p = parseAddress(a);
            return p ? <button key={a} className="pick" onClick={() => pickRecipient(p)}><Avatar seed={a}>#</Avatar><span><b className="num">{shortAddr(a, 6, 6)}</b><small>Wallet address</small></span></button> : null;
          })
        )}
      </div>
    </Sheet>
  );
}
