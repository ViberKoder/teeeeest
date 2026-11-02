import { useState } from 'react';
import { api } from '../api/server';
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

const Star = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5l2.2 6.3 6.3 2.2-6.3 2.2L12 20.5l-2.2-6.3-6.3-2.2 6.3-2.2z" />
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
  // the balance is everything that is yours: in the wallet, committed on-chain (claimed with your next send) and just earned
  const shown = useCountUp(eggBalance + data.ready + data.accruing);
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
          <button className="round glass" aria-label="Keys & Backup" onClick={() => setOpen('settings')}><Gear width={20} height={20} /></button>
          <div className="ttl">
            <b>{eggOn ? 'Egg' : 'Wallet'}<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path fill="#2f9bff" d="M12 1.8l2.4 1.7 2.9-.1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.7-2.9-.1L12 22.2l-2.4-1.7-2.9.1-1-2.7-2.4-1.7.9-2.8-.9-2.8 2.4-1.7 1-2.8 2.9.1z" /><path d="M8.2 12.2l2.7 2.7 5-5.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></b>
            <button className="sub num" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.tap(); toast('Address copied'); }}>
              {cfg.network === 'testnet' ? 'testnet · ' : 'mini app · '}{shortAddr(addr, 4, 4)}
            </button>
          </div>
          <span className="round ghost" aria-hidden><EggMark /></span>
        </div>
        <div className="shadow" />
        <div className="stage"><Egg3D energy={data.ready > 0n ? 1 : 0.15} burst={burst} shaking={false} /></div>
      </section>

      <section className="counter">
        <div className="label">{eggOn ? 'My eggs' : 'Balance'}</div>
        {first ? (
          <div className="skeleton" style={{ height: 56, width: 190, margin: '8px auto 0' }} />
        ) : eggOn ? (
          <div className="count num">{whole}{frac && <span className="frac">.{frac}</span>}</div>
        ) : (
          <div className="count num">{formatUnits(data.ton, 9, 3)}<span className="frac"> TON</span></div>
        )}
        <div className="chips">
          {eggOn && nest > 0n && (
            <span className={`chip num ${data.ready > 0n ? 'good' : ''}`}>{data.ready > 0n ? `+${formatUnits(data.ready, D, 2)} ready to hatch` : `${formatUnits(data.accruing, D, 2)} hatching`}</span>
          )}
          {eggOn && (
            <span className="island num" title="TON pays network fees"><span className="ti"><TonMark /></span>{formatUnits(data.ton, 9, 3)} TON</span>
          )}
        </div>
      </section>

      <div className="actions4">
        {eggOn && (
          <button className={`act ${data.ready > 0n ? 'hot' : ''}`} onClick={hatch}>
            <span className="ic"><Star /></span>Hatch
            {data.ready > 0n && <span className="badge-n num">{formatUnits(data.ready, D, 0)}</span>}
          </button>
        )}
        <button className="act" onClick={() => setOpen('send')}><span className="ic"><Send width={22} height={22} /></span>Send</button>
        <button className="act" onClick={() => setOpen('receive')}><span className="ic"><Receive width={22} height={22} /></span>Receive</button>
        <button className="act" onClick={swap}><span className="ic"><Swap /></span>Swap</button>
      </div>

      {eggOn && (
        <button className="banner" onClick={() => (data.ready > 0n ? setOpen('claim') : setOpen('intro'))}>
          <div className="bt">
            <b>{nest > 0n ? `${formatUnits(nest, D, 2)} EGG in the nest` : 'Your eggs hatch while you play'}</b>
            <span>{data.ready > 0n ? 'Verified on-chain — tap to hatch' : nest > 0n ? 'Joins the blockchain with the next update' : 'How hatching works'} ›</span>
            {nest > 0n && <div className="meter"><i style={{ width: `${progress}%` }} /></div>}
          </div>
          <div className="bi"><EggMark /></div>
        </button>
      )}

      {data.incoming.length > 0 && (
        <div className="incoming">
          <span className="dot" />
          <div>
            <b>On its way to you</b>
            <span className="num">{data.incoming.map((i) => `${formatUnits(BigInt(i.amount), 9, i.kind === 'ton' ? 3 : 2)} ${i.kind === 'ton' ? 'TON' : 'EGG'}`).join(' · ')} sent to your @username</span>
          </div>
        </div>
      )}

      {data.waiting.length > 0 && (
        <Section title="Waiting to be collected">
          {data.waiting.map((w) => {
            const left = w.time + data.refundAfter - Math.floor(Date.now() / 1000);
            return (
              <Row
                key={w.key}
                icon={<span className={`row-icon ${w.kind === 'egg' ? 'icon-egg' : 'icon-ton'}`}>{w.kind === 'egg' ? <EggMark /> : <TonMark />}</span>}
                title={<span className="num">{formatUnits(BigInt(w.amount), 9, w.kind === 'ton' ? 3 : 2)} {w.kind === 'ton' ? 'TON' : 'EGG'}</span>}
                subtitle={<span className="num">to {w.to} · not collected yet</span>}
                trailing={left > 0
                  ? <span className="hint">back in {Math.ceil(left / 86400)}d</span>
                  : <button className="btn link" onClick={() => { haptic.tap(); void api.refund(w.key).then(() => toast('Taking it back…')).catch(() => toast('Could not take it back')); }}>Take back</button>}
              />
            );
          })}
        </Section>
      )}

      {groups.length === 0 ? (
        <Section title="Recent"><div className="empty">{data.loading ? 'Loading…' : 'Your transfers and hatches will show up here'}</div></Section>
      ) : (
        groups.map((g, gi) => (
          <Section key={g.day} title={gi === 0 ? `Recent · ${g.day}` : g.day}>
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
