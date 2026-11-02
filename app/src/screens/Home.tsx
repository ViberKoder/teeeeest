import { useState } from 'react';
import { cfg, endpoints } from '../config';
import { formatUnits, shortAddr } from '../lib/format';
import { haptic, openExternal } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { EggMark, TonMark } from '../ui/Egg';
import { EggCard, Pager, TonCard } from '../ui/Card';
import { Gear, Receive, Send, Sparkle } from '../ui/Icons';
import { Row, Section } from '../ui/native';
import { useToast } from '../ui/toast';
import type { Activity } from '../chain/history';
import { ClaimPage } from './Claim';
import { IntroPage } from './Intro';
import { ReceivePage } from './Receive';
import { SendPage } from './Send';
import { SettingsPage } from './Settings';

type Open = null | 'send' | 'receive' | 'claim' | 'settings' | 'intro';

const dayLabel = (t: number) => {
  const d = new Date(t * 1000);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  const y = new Date(today.getTime() - 86_400_000);
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};

export function Home() {
  const w = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(w.firstRun ? 'intro' : null);
  const { data, provider } = w;
  if (!provider) return null;

  const D = cfg.token.decimals;
  const eggOn = Boolean(w.masterAddress);
  const eggBalance = data.egg?.balance ?? 0n;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const first = data.loading && !data.egg && data.ton === 0n;
  const close = () => { setOpen(null); w.dismissIntro(); };
  const copy = () => { void navigator.clipboard?.writeText(addr); haptic.tap(); toast('Address copied'); };
  const nest = data.ready + data.accruing;
  const progress = nest > 0n ? Number((data.ready * 100n) / nest) : 0;

  // group activity by day
  const groups: { day: string; items: Activity[] }[] = [];
  for (const a of data.activity.slice(0, 20)) {
    const day = dayLabel(a.time);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  }

  return (
    <div className="screen">
      <div className="titlebar">
        <h1>Wallet</h1>
        <button className="round" aria-label="Settings" onClick={() => setOpen('settings')}><Gear width={20} height={20} /></button>
      </div>

      {eggOn ? (
        <Pager>
          {[
            <EggCard key="egg" balance={eggBalance} decimals={D} address={addr} ready={data.ready} loading={first} onQr={() => setOpen('receive')} onCopy={copy} />,
            <TonCard key="ton" balance={data.ton} address={addr} onQr={() => setOpen('receive')} onCopy={copy} />,
          ]}
        </Pager>
      ) : (
        <Pager>{[<TonCard key="ton" balance={data.ton} address={addr} onQr={() => setOpen('receive')} onCopy={copy} />]}</Pager>
      )}

      <div className="duo">
        {eggOn ? (
          <button className="big hatch" onClick={() => (data.ready > 0n ? setOpen('claim') : toast(nest > 0n ? 'Still hatching — it joins the next blockchain update' : 'Nothing in the nest yet'))}>
            <Sparkle width={20} height={20} /> Hatch
            {data.ready > 0n && <span className="pill-n num">{formatUnits(data.ready, D, 0)}</span>}
          </button>
        ) : (
          <button className="big soft" onClick={() => setOpen('receive')}><Receive width={20} height={20} /> Receive</button>
        )}
        <button className="big soft" onClick={() => setOpen('send')}><Send width={20} height={20} /> Send</button>
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

      {groups.length === 0 ? (
        <Section title="Transactions"><div className="empty">{data.loading ? 'Loading…' : 'Your transfers and hatches will show up here'}</div></Section>
      ) : (
        groups.map((g, gi) => (
          <Section key={g.day} title={gi === 0 ? `Transactions · ${g.day}` : g.day}>
            {g.items.map((a) => (
              <Row
                key={a.id}
                onClick={a.label ? undefined : () => openExternal(`${endpoints.explorer}/${addr}`)}
                icon={
                  <span className={`row-icon ${a.label === 'hatch' ? 'hatch-ic' : a.kind === 'egg' ? 'icon-egg' : 'icon-ton'}`}>
                    {a.label === 'hatch' ? <Sparkle width={18} height={18} /> : a.kind === 'egg' ? <EggMark /> : <TonMark />}
                  </span>
                }
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
      {open === 'claim' && <ClaimPage onClose={close} />}
      {open === 'settings' && <SettingsPage onClose={close} />}
      {open === 'intro' && <IntroPage onClose={close} />}
    </div>
  );
}
