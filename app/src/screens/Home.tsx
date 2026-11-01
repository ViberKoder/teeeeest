import { useState } from 'react';
import { cfg } from '../config';
import { formatUnits, shortAddr, timeAgo } from '../lib/format';
import { haptic, openExternal } from '../lib/tg';
import { endpoints } from '../config';
import { useWallet } from '../state/wallet';
import { Egg, EggMark, TonMark } from '../ui/Egg';
import { Gear, Receive, Send, Sparkle } from '../ui/Icons';
import { useToast } from '../ui/toast';
import { ClaimSheet } from './Claim';
import { ReceiveSheet } from './Receive';
import { SendSheet } from './Send';
import { SettingsSheet } from './Settings';

type Open = null | 'send' | 'receive' | 'claim' | 'settings';

export function Home() {
  const w = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const { data, provider } = w;
  if (!provider) return null;

  const eggBalance = data.egg?.balance ?? 0n;
  const total = eggBalance + data.pending;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const hasPending = data.pending > 0n;
  const first = data.loading && !data.egg && data.ton === 0n;

  return (
    <div className="screen">
      <div className="top">
        <button className="who" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.tap(); toast('Address copied'); }}>
          <span className="dot" />
          <span className="num">{shortAddr(addr, 4, 4)}</span>
          {cfg.network === 'testnet' && <span className="badge">TESTNET</span>}
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={() => setOpen('settings')}><Gear /></button>
      </div>

      <section className="hero">
        <div className="tiny" style={{ color: 'inherit', opacity: 0.7 }}>Total balance</div>
        {first ? (
          <div className="skeleton" style={{ height: 46, width: 190, margin: '10px 0' }} />
        ) : (
          <div className="big num">{formatUnits(total, cfg.token.decimals, 2)}<small>EGG</small></div>
        )}
        <div className="chips">
          <span className="chip num">On-chain {formatUnits(eggBalance, cfg.token.decimals, 2)}</span>
          {hasPending && <span className="chip num"><i className="pulse" /> {formatUnits(data.pending, cfg.token.decimals, 2)} in the nest</span>}
        </div>
        <div className="egg-deco"><Egg size={124} state="idle" /></div>
      </section>

      <div className="actions">
        <button className="action" onClick={() => setOpen('send')}><span className="ic"><Send /></span>Send</button>
        <button className="action" onClick={() => setOpen('receive')}><span className="ic"><Receive /></span>Receive</button>
        <button className={`action hatch ${hasPending ? 'ready' : ''}`} onClick={() => (hasPending ? setOpen('claim') : toast('Nothing in the nest yet — go hatch some eggs'))}>
          <span className="ic"><Sparkle /></span>Hatch
        </button>
      </div>

      {hasPending && (
        <button className="nest" onClick={() => setOpen('claim')}>
          <Egg size={38} state="idle" />
          <div className="grow">
            <div style={{ fontWeight: 800 }} className="num">{formatUnits(data.pending, cfg.token.decimals, 2)} EGG are waiting</div>
            <div className="small muted">Move them to your wallet in one tap</div>
          </div>
          <span style={{ fontWeight: 800, color: 'var(--yolk)' }}>Move →</span>
        </button>
      )}

      <div className="tiny section-title">Assets</div>
      <div className="list">
        <div className="item">
          <div className="coin egg"><EggMark /></div>
          <div className="grow"><div className="t">EGG</div><div className="s">{hasPending ? `${formatUnits(data.pending, cfg.token.decimals, 2)} more in the nest` : 'Egg token'}</div></div>
          <div className="t num">{formatUnits(eggBalance, cfg.token.decimals, 2)}</div>
        </div>
        <div className="item">
          <div className="coin ton"><TonMark /></div>
          <div className="grow"><div className="t">TON</div><div className="s">Network fees</div></div>
          <div className="t num">{formatUnits(data.ton, cfg.ton.decimals, 3)}</div>
        </div>
      </div>

      <div className="tiny section-title">Activity</div>
      {data.activity.length === 0 ? (
        <div className="card center muted small" style={{ padding: 22 }}>
          {data.loading ? 'Loading…' : 'Nothing here yet. Your first transfer will show up here.'}
        </div>
      ) : (
        <div className="list">
          {data.activity.slice(0, 12).map((a) => (
            <button className="item" key={a.id} onClick={() => openExternal(`${endpoints.explorer}/${addr}`)}>
              <div className={`coin ${a.direction}`}>{a.direction === 'in' ? <Receive width={18} height={18} /> : <Send width={18} height={18} />}</div>
              <div className="grow">
                <div className="t">{a.direction === 'in' ? 'Received' : 'Sent'} {a.symbol}{a.failed ? ' · failed' : ''}</div>
                <div className="s num">{a.peer ? shortAddr(a.peer.replace(/^0:/, ''), 5, 4) : ''}{a.comment ? ` · ${a.comment}` : ''} · {timeAgo(a.time)}</div>
              </div>
              <div className="t num" style={{ color: a.direction === 'in' ? 'var(--good)' : 'var(--text)' }}>
                {a.direction === 'in' ? '+' : '−'}{formatUnits(a.amount, a.decimals, 2)}
              </div>
            </button>
          ))}
        </div>
      )}

      {data.error && <p className="hint bad center" style={{ marginTop: 14 }}>{data.error}</p>}

      {open === 'send' && <SendSheet onClose={() => setOpen(null)} />}
      {open === 'receive' && <ReceiveSheet onClose={() => setOpen(null)} />}
      {open === 'claim' && <ClaimSheet onClose={() => setOpen(null)} />}
      {open === 'settings' && <SettingsSheet onClose={() => setOpen(null)} />}
    </div>
  );
}

