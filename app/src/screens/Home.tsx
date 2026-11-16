import { lazy, Suspense, useState } from 'react';
import { cfg, endpoints } from '../config';
import { formatUnits, shortAddr } from '../lib/format';
import { levelOf } from '../lib/level';
import { haptic, openExternal } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Bar } from '../ui/bits';
import { Egg3D } from '../ui/Egg3D';
import { Coin, EggMini } from '../ui/EggMini';
import { GramCoin, GramMark } from '../ui/Gram';
import { Gear, Receive, Send } from '../ui/Icons';
import { useToast } from '../ui/toast';
import { useCountUp } from '../ui/useCountUp';
import type { Activity } from '../chain/history';
// secondary screens load on first use: the wallet opens without waiting for them
const ClaimPage = lazy(() => import('./Claim').then((m) => ({ default: m.ClaimPage })));
const IntroPage = lazy(() => import('./Intro').then((m) => ({ default: m.IntroPage })));
const ReceivePage = lazy(() => import('./Receive').then((m) => ({ default: m.ReceivePage })));
const SendPage = lazy(() => import('./Send').then((m) => ({ default: m.SendPage })));
const SettingsPage = lazy(() => import('./Settings').then((m) => ({ default: m.SettingsPage })));

type Open = null | 'send' | 'receive' | 'claim' | 'settings' | 'intro';

const Swap = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 4v13M7 4L3.5 7.5M7 4l3.5 3.5M17 20V7M17 20l-3.5-3.5M17 20l3.5-3.5" />
  </svg>
);

const dayLabel = (t: number) => {
  const d = new Date(t * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(today.getTime() - 86_400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
};
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** One transaction: the egg (or the gem) on a coin with the direction as a badge, who it was with, when, and how much. */
function Tx({ a, onOpen }: { a: Activity; onOpen: () => void }) {
  const hatch = a.label === 'hatch';
  const isEgg = a.kind === 'egg';
  const title = hatch ? 'Hatched' : a.failed ? `${a.direction === 'in' ? 'Receive' : 'Send'} failed` : a.direction === 'in' ? 'Received' : 'Sent';
  const who = hatch ? 'Verified on the blockchain' : a.peer ? shortAddr(a.peer.replace(/^0:/, ''), 5, 4) : '';
  return (
    <button className={`tx ${a.failed ? 'failed' : ''}`} onClick={onOpen}>
      <Coin tone={isEgg ? 'egg' : 'gram'} badge={hatch ? 'spark' : a.direction}>
        {isEgg ? <EggMini size={30} tone={hatch ? 'gold' : 'cream'} /> : <GramMark size={24} />}
      </Coin>
      <span className="tx-main"><b>{title}</b><span className="num">{clock(a.time)}{who ? ` · ${who}` : ''}{a.comment && !hatch ? ` · ${a.comment}` : ''}</span></span>
      <span className={`tx-amt num ${a.direction === 'in' && !a.failed ? 'in' : ''}`}>
        {a.direction === 'in' ? '+' : '−'}{formatUnits(a.amount, a.decimals, 2)}
        <small>{a.symbol === 'TON' ? 'Gram' : a.symbol}</small>
      </span>
    </button>
  );
}

export function Home() {
  const w = useWallet();
  const toast = useToast();
  // a "send" link from the bot (/send @user 10) opens the Send screen prefilled — the user still confirms it with their own key
  const [prefill] = useState(() => {
    const q = new URLSearchParams(location.search);
    if (!q.get('send')) return null;
    const p = { to: q.get('send') ?? '', amount: q.get('amount') ?? '' };
    history.replaceState(null, '', location.pathname + location.hash); // once: a reload must not reopen it
    return p;
  });
  const [open, setOpen] = useState<Open>(prefill ? 'send' : w.firstRun ? 'intro' : null);
  const [burst, setBurst] = useState(0);
  const { data, provider } = w;
  const D = cfg.token.decimals;
  const eggBalance = data.egg?.balance ?? 0n;
  // ONE number: what is in the wallet, what is committed on-chain and what was just earned are all simply "your eggs"
  const total = eggBalance + data.ready + data.accruing;
  const shown = useCountUp(total);
  if (!provider) return null;

  const eggOn = Boolean(w.masterAddress);
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const first = data.loading && !data.egg && data.ton === 0n;
  const close = () => { setOpen(null); w.dismissIntro(); };
  const [whole, frac] = formatUnits(shown, D, 2).split('.');
  const lv = levelOf(total > BigInt(data.me?.ledger ?? '0') ? total : BigInt(data.me?.ledger ?? '0'), D);

  const swap = () => {
    haptic.tap();
    if (!w.masterAddress) return toast('Swap opens once EGG is listed on a DEX');
    // eggs that are not on-chain yet have to be there before they can be swapped: settle them first, then swap
    if (data.ready > 0n) { toast('Moving your eggs on-chain for the swap'); return setOpen('claim'); }
    openExternal(`https://app.ston.fi/swap?ft=TON&tt=${w.masterAddress.toString()}`);
  };
  const tap = () => { haptic.tap(); setBurst((b) => b + 1); };

  const groups: { day: string; items: Activity[] }[] = [];
  for (const a of data.activity.slice(0, 30)) {
    const day = dayLabel(a.time);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  }

  return (
    <div className="screen home">
      <section className="home-hero">
        <div className="bg" />
        <div className="bar">
          <button className="round glass" aria-label="Settings" onClick={() => setOpen('settings')}><Gear width={20} height={20} /></button>
          <div className="ttl">
            <b>{eggOn ? 'Egg' : 'Wallet'}</b>
            <button className="sub num" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.tap(); toast('Address copied'); }}>
              {cfg.network === 'testnet' ? 'testnet · ' : ''}{shortAddr(addr, 4, 4)}
            </button>
          </div>
          <button className="round glass gramchip" aria-label="Gram balance" onClick={() => toast(`${formatUnits(data.ton, 9, 3)} Gram pays the network fees`)}><GramMark size={22} color="#2f9bff" /></button>
        </div>
        <div className="shadow" />
        <div className="stage" onPointerDown={tap}><Egg3D energy={0.35} burst={burst} shaking={false} /></div>
      </section>

      <section className="counter">
        <div className="label">{eggOn ? 'My eggs' : 'Balance'}</div>
        {first ? (
          <div className="skeleton" style={{ height: 56, width: 190, margin: '8px auto 0' }} />
        ) : eggOn ? (
          <div className="count num">{whole}{frac && <span className="frac">.{frac}</span>}</div>
        ) : (
          <div className="count num">{formatUnits(data.ton, 9, 3)}<span className="frac"> Gram</span></div>
        )}
        {eggOn && (
          <div className="lvl" title={lv.next ? `${lv.toNext.toFixed(lv.toNext < 10 ? 1 : 0)} EGG to ${lv.next.name}` : 'Top level'}>
            <span className="lvl-ic">{lv.cur.icon}</span>
            <span className="lvl-t"><b>{lv.cur.name}</b>{lv.next ? <em>{lv.next.icon} {lv.next.name}</em> : <em>top level</em>}</span>
            <Bar value={lv.progress} />
          </div>
        )}
      </section>

      <div className="acts3">
        <button className="act3" onClick={() => setOpen('send')}><span className="disc d1"><Send width={24} height={24} /></span>Send</button>
        <button className="act3" onClick={() => setOpen('receive')}><span className="disc d2"><Receive width={24} height={24} /></span>Receive</button>
        <button className="act3" onClick={swap}><span className="disc d3"><Swap /></span>Swap</button>
      </div>

      <div className="gram-row">
        <GramCoin size={36} />
        <div><b>Gram</b><span>pays the network fee</span></div>
        <em className="num">{formatUnits(data.ton, 9, 3)}</em>
      </div>

      <h2 className="sec">History</h2>
      {groups.length === 0 ? (
        <div className="card empty-state"><EggMini size={56} wobble /><b>{data.loading ? 'Loading…' : 'No transactions yet'}</b><span>{data.loading ? '' : 'Your eggs and Gram will show up here'}</span></div>
      ) : (
        groups.map((g) => (
          <div key={g.day} className="txgroup">
            <div className="txday">{g.day}</div>
            <div className="card list">
              {g.items.map((a) => <Tx key={a.id} a={a} onOpen={() => (a.label ? undefined : openExternal(`${endpoints.explorer}/${addr}`))} />)}
            </div>
          </div>
        ))
      )}

      <button className="btn link" style={{ marginTop: 10 }} onClick={() => setOpen('intro')}>How does it work?</button>
      {data.error && <p className="hint bad center" style={{ marginTop: 10 }}>{data.error}</p>}

      <Suspense fallback={null}>
        {open === 'send' && <SendPage onClose={close} initialTo={prefill?.to} initialAmount={prefill?.amount} />}
        {open === 'receive' && <ReceivePage onClose={close} />}
        {open === 'claim' && <ClaimPage onClose={(hatched?: boolean) => { close(); if (hatched) setBurst((b) => b + 1); }} />}
        {open === 'settings' && <SettingsPage onClose={close} />}
        {open === 'intro' && <IntroPage onClose={close} />}
      </Suspense>
    </div>
  );
}
