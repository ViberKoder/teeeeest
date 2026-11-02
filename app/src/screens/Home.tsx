import { useState } from 'react';
import { cfg, endpoints } from '../config';
import { formatUnits, shortAddr, timeAgo } from '../lib/format';
import { haptic, openExternal } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Egg, EggMark, TonMark } from '../ui/Egg';
import { Gear, Receive, Send, Sparkle } from '../ui/Icons';
import { Row, Section } from '../ui/native';
import { useToast } from '../ui/toast';
import { ClaimPage } from './Claim';
import { ReceivePage } from './Receive';
import { SendPage } from './Send';
import { SettingsPage } from './Settings';

type Open = null | 'send' | 'receive' | 'claim' | 'settings';

export function Home() {
  const w = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const { data, provider } = w;
  if (!provider) return null;

  const D = cfg.token.decimals;
  const eggOn = Boolean(w.masterAddress); // EGG is shown only when a token master is configured
  const eggBalance = data.egg?.balance ?? 0n;
  const nest = data.ready + data.accruing;
  const total = eggBalance + nest;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const first = data.loading && !data.egg && data.ton === 0n;
  const close = () => setOpen(null);

  return (
    <div className="screen">
      <div className="top">
        <button className="pill" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.tap(); toast('Address copied'); }}>
          <span className="dot" />
          <span className="num">{shortAddr(addr, 4, 4)}</span>
          {cfg.network === 'testnet' && <span className="badge">TESTNET</span>}
        </button>
        <button className="round" aria-label="Settings" onClick={() => setOpen('settings')}><Gear width={20} height={20} /></button>
      </div>

      <div className="balance">
        <div className="label">Balance</div>
        {first ? (
          <div className="skeleton" style={{ height: 50, width: 200, margin: '8px auto' }} />
        ) : eggOn ? (
          <div className="amount num">{formatUnits(total, D, 2)}<small>EGG</small></div>
        ) : (
          <div className="amount num">{formatUnits(data.ton, 9, 3)}<small>TON</small></div>
        )}
        <div className="sub num">
          {!eggOn ? 'Self-custody TON wallet' : nest > 0n ? `${formatUnits(eggBalance, D, 2)} in wallet · ${formatUnits(nest, D, 2)} in the nest` : `${formatUnits(data.ton, 9, 3)} TON for fees`}
        </div>
      </div>

      <div className="tiles" style={eggOn ? undefined : { gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <button className="tile" onClick={() => setOpen('send')}><span className="tile-ic"><Send width={18} height={18} /></span>Send</button>
        <button className="tile" onClick={() => setOpen('receive')}><span className="tile-ic"><Receive width={18} height={18} /></span>Receive</button>
        {eggOn && <button
          className={`tile ${data.ready > 0n ? 'hot' : ''}`}
          onClick={() => (data.ready > 0n ? setOpen('claim') : toast(nest > 0n ? 'Still hatching — it joins the next blockchain update' : 'Nothing in the nest yet'))}
        >
          <span className="tile-ic"><Sparkle width={18} height={18} /></span>Hatch
        </button>}
      </div>

      {eggOn && nest > 0n && (
        <button className="nest" onClick={() => data.ready > 0n && setOpen('claim')}>
          <Egg size={34} />
          <div className="grow" style={{ minWidth: 0 }}>
            {data.ready > 0n ? (
              <>
                <div className="t num">{formatUnits(data.ready, D, 2)} EGG ready to hatch</div>
                <div className="s">Committed on-chain — yours to move in one tap</div>
              </>
            ) : (
              <>
                <div className="t num">{formatUnits(data.accruing, D, 2)} EGG hatching</div>
                <div className="s">Joins the blockchain with the next update</div>
              </>
            )}
          </div>
          {data.ready > 0n && <span className="go">Hatch</span>}
        </button>
      )}

      <Section title="Assets">
        {eggOn && <Row
          icon={<span className="row-icon icon-egg"><EggMark /></span>}
          title="EGG"
          subtitle={nest > 0n ? `+ ${formatUnits(nest, D, 2)} in the nest` : 'Egg token'}
          trailing={<span className="num">{formatUnits(eggBalance, D, 2)}</span>}
        />}
        <Row
          icon={<span className="row-icon icon-ton"><TonMark /></span>}
          title="TON"
          subtitle="Network fees"
          trailing={<span className="num">{formatUnits(data.ton, 9, 3)}</span>}
        />
      </Section>

      <Section title="Activity">
        {data.activity.length === 0 ? (
          <div className="empty">{data.loading ? 'Loading…' : 'Your transfers will show up here'}</div>
        ) : (
          data.activity.slice(0, 12).map((a) => (
            <Row
              key={a.id}
              onClick={() => openExternal(`${endpoints.explorer}/${addr}`)}
              icon={<span className={`row-icon ${a.direction === 'in' ? 'icon-in' : 'icon-out'}`}>{a.direction === 'in' ? <Receive width={18} height={18} /> : <Send width={18} height={18} />}</span>}
              title={`${a.direction === 'in' ? 'Received' : 'Sent'} ${a.symbol}${a.failed ? ' · failed' : ''}`}
              subtitle={<span className="num">{a.peer ? shortAddr(a.peer.replace(/^0:/, ''), 5, 4) : ''}{a.comment ? ` · ${a.comment}` : ''} · {timeAgo(a.time)}</span>}
              trailing={<span className="num" style={{ color: a.direction === 'in' ? 'var(--good)' : undefined }}>{a.direction === 'in' ? '+' : '−'}{formatUnits(a.amount, a.decimals, 2)}</span>}
            />
          ))
        )}
      </Section>

      {data.error && <p className="hint bad center" style={{ marginTop: 14 }}>{data.error}</p>}

      {open === 'send' && <SendPage onClose={close} />}
      {open === 'receive' && <ReceivePage onClose={close} />}
      {open === 'claim' && <ClaimPage onClose={close} />}
      {open === 'settings' && <SettingsPage onClose={close} />}
    </div>
  );
}
