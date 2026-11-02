import { useState } from 'react';
import { cfg, endpoints } from '../config';
import { formatUnits, shortAddr } from '../lib/format';
import { haptic, openExternal } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Egg3D } from '../ui/Egg3D';
import { EggMark, TonMark } from '../ui/Egg';
import { Gear, Receive, Send, Sparkle } from '../ui/Icons';
import { Row, Section } from '../ui/native';
import { useToast } from '../ui/toast';
import { useCountUp } from '../ui/useCountUp';
import type { Activity } from '../chain/history';
import { ClaimPage } from './Claim';
import { IntroPage } from './Intro';
import { ReceivePage } from './Receive';
import { SendPage } from './Send';
import { SettingsPage } from './Settings';

type Open = null | 'send' | 'receive' | 'claim' | 'settings' | 'intro';

const Swap = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 4v13M7 4L3.5 7.5M7 4l3.5 3.5M17 20V7M17 20l-3.5-3.5M17 20l3.5-3.5" />
  </svg>
);

const dayLabel = (t: number) => {
  const d = new Date(t * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(today.getTime() - 86_400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};

export function Home() {
  const w = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(w.firstRun ? 'intro' : null);
  const [burst, setBurst] = useState(0);
  const { data, provider } = w;
  const D = cfg.token.decimals;
  const eggBalance = data.egg?.balance ?? 0n;
  const shown = useCountUp(eggBalance);
  if (!provider) return null;

  const eggOn = Boolean(w.masterAddress);
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const first = data.loading && !data.egg && data.ton === 0n;
  const close = () => { setOpen(null); w.dismissIntro(); };
  const nest = data.ready + data.accruing;
  const progress = nest > 0n ? Number((data.ready * 100n) / nest) : 0;
  const [whole, frac] = formatUnits(shown, D, 2).split('.');

  const swap = () => {
    haptic.tap();
    if (!w.masterAddress) return toast('Swap opens once EGG is listed on a DEX');
    openExternal(`https://app.ston.fi/swap?ft=TON&tt=${w.masterAddress.toString()}`);
  };
  const hatch = () => {
    haptic.tap();
    if (data.ready > 0n) setOpen('claim');
    else { setBurst((b) => b + 1); toast(nest > 0n ? 'Still hatching — it joins the next blockchain update' : 'Nothing in the nest yet'); }
  };

  const groups: { day: string; items: Activity[] }[] = [];
  for (const a of data.activity.slice(0, 20)) {
    const day = dayLabel(a.time);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  }

  return (
    <div className="screen">
      <section className="home-hero">
        <div className="bg" />
        <div className="bar">
          <button className="pill glass" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.tap(); toast('Address copied'); }}>
            <span className="dot" /><span className="num">{shortAddr(addr, 4, 4)}</span>
            {cfg.network === 'testnet' && <span className="badge">TESTNET</span>}
          </button>
          <button className="round glass" aria-label="Keys & Backup" onClick={() => setOpen('settings')}><Gear width={20} height={20} /></button>
        </div>
        <div className="shadow" />
        <div className="stage"><Egg3D energy={data.ready > 0n ? 1 : 0.15} burst={burst} shaking={false} /></div>
        <div className="hint">Drag to spin · pinch to zoom · tap for sparkles</div>
      </section>

      <section className="counter">
        <div className="label">{eggOn ? 'My eggs' : 'Balance'}</div>
        {first ? (
          <div className="skeleton" style={{ height: 56, width: 190, margin: '8px auto 0' }} />
        ) : eggOn ? (
          <div className="count num">{whole}{frac && <span className="frac">.{frac}</span>}<span className="unit">EGG</span></div>
        ) : (
          <div className="count num">{formatUnits(data.ton, 9, 3)}<span className="unit">TON</span></div>
        )}
        {eggOn && nest > 0n && (
          <div className="chip num"><i />{data.ready > 0n ? `${formatUnits(data.ready, D, 2)} ready to hatch` : `${formatUnits(data.accruing, D, 2)} hatching`}</div>
        )}
      </section>

      <div className="actions4">
        {eggOn && (
          <button className={`act ${data.ready > 0n ? 'hot' : ''}`} onClick={hatch}>
            <span className="ic"><Sparkle width={22} height={22} /></span>Hatch
            {data.ready > 0n && <span className="badge-n num">{formatUnits(data.ready, D, 0)}</span>}
          </button>
        )}
        <button className="act" onClick={() => setOpen('send')}><span className="ic"><Send width={22} height={22} /></span>Send</button>
        <button className="act" onClick={() => setOpen('receive')}><span className="ic"><Receive width={22} height={22} /></span>Receive</button>
        <button className="act" onClick={swap}><span className="ic"><Swap /></span>Swap</button>
      </div>

      {eggOn && nest > 0n && (
        <div className="nest-card">
          <div className="head">
            <span className="row-icon hatch-ic"><EggMark /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t num">{formatUnits(nest, D, 2)} EGG in the nest</div>
              <div className="s">{data.ready > 0n ? `${formatUnits(data.ready, D, 2)} verified on-chain, ready to hatch` : 'Joins the blockchain with the next update'}</div>
            </div>
          </div>
          <div className="meter"><i style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <Section title="Assets">
        {eggOn && <Row icon={<span className="row-icon icon-egg"><EggMark /></span>} title="EGG" subtitle="Egg token" trailing={<span className="num">{formatUnits(eggBalance, D, 2)}</span>} />}
        <Row icon={<span className="row-icon icon-ton"><TonMark /></span>} title="TON" subtitle="Pays network fees" trailing={<span className="num">{formatUnits(data.ton, 9, 3)}</span>} />
      </Section>

      {groups.length === 0 ? (
        <Section title="Transactions"><div className="empty">{data.loading ? 'Loading…' : 'Your transfers and hatches will show up here'}</div></Section>
      ) : (
        groups.map((g, gi) => (
          <Section key={g.day} title={gi === 0 ? `Transactions · ${g.day}` : g.day}>
            {g.items.map((a) => (
              <Row
                key={a.id}
                onClick={a.label ? undefined : () => openExternal(`${endpoints.explorer}/${addr}`)}
                icon={<span className={`row-icon ${a.label === 'hatch' ? 'hatch-ic' : a.kind === 'egg' ? 'icon-egg' : 'icon-ton'}`}>{a.label === 'hatch' ? <Sparkle width={18} height={18} /> : a.kind === 'egg' ? <EggMark /> : <TonMark />}</span>}
                title={a.label === 'hatch' ? 'Hatched' : `${a.direction === 'in' ? 'Received' : 'Sent'}${a.failed ? ' · failed' : ''}`}
                subtitle={<span className="num">{a.label === 'hatch' ? 'Verified by the blockchain' : a.peer ? shortAddr(a.peer.replace(/^0:/, ''), 5, 4) : ''}{a.comment && !a.label ? ` · ${a.comment}` : ''}</span>}
                trailing={<span className="num" style={{ color: a.direction === 'in' ? 'var(--good)' : undefined }}>{a.direction === 'in' ? '+' : '−'}{formatUnits(a.amount, a.decimals, 2)} <span className="hint">{a.symbol}</span></span>}
              />
            ))}
          </Section>
        ))
      )}

      <div className="notice">Your balance is public due to blockchain transparency.</div>
      <button className="btn link" style={{ marginTop: 4 }} onClick={() => setOpen('intro')}>How does it work?</button>
      {data.error && <p className="hint bad center" style={{ marginTop: 10 }}>{data.error}</p>}

      {open === 'send' && <SendPage onClose={close} />}
      {open === 'receive' && <ReceivePage onClose={close} />}
      {open === 'claim' && <ClaimPage onClose={(hatched?: boolean) => { close(); if (hatched) setBurst((b) => b + 1); }} />}
      {open === 'settings' && <SettingsPage onClose={close} />}
      {open === 'intro' && <IntroPage onClose={close} />}
    </div>
  );
}
