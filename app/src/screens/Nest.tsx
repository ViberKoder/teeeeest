import { Egg3D } from '../ui/Egg3D';
import { cfg } from '../config';
import { formatUnits, shortAddr } from '../lib/format';
import { leagueOf } from '../lib/league';
import { haptic } from '../lib/tg';
import { useNav } from '../state/nav';
import { useWallet } from '../state/wallet';
import { EggCoin } from '../ui/EggCoin';
import { GramCoin } from '../ui/Gram';
import { Bolt, Chevron, Gear, Receive, Send, Swap } from '../ui/Icons';
import { ActivityList } from '../ui/Tx';
import { useToast } from '../ui/toast';
import { useCountUp } from '../ui/useCountUp';

/** The wallet tab. One number for the eggs — whatever stage they are in on their way to the blockchain, they are simply yours. */
export function Nest({ burst, bonus }: { burst: number; bonus: string | null }) {
  const w = useWallet();
  const nav = useNav();
  const toast = useToast();
  const { data, provider } = w;
  const D = cfg.token.decimals;
  const eggOn = Boolean(w.masterAddress);
  const total = (data.egg?.balance ?? 0n) + data.ready + data.accruing;
  const shown = useCountUp(total);
  if (!provider) return null;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const first = data.loading && !data.egg && data.ton === 0n;
  const [whole, frac] = formatUnits(shown, D, 2).split('.');
  const lg = leagueOf(total);

  return (
    <div className="nest-tab">
      <section className="home-hero">
        <div className="bg" />
        <div className="bar">
          <button className="round glass" aria-label="Settings" onClick={() => nav.open({ k: 'settings' })}><Gear width={20} height={20} /></button>
          <div className="ttl">
            <b>{eggOn ? 'Egg' : 'Wallet'}<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path fill="#2f9bff" d="M12 1.8l2.4 1.7 2.9-.1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.7-2.9-.1L12 22.2l-2.4-1.7-2.9.1-1-2.7-2.4-1.7.9-2.8-.9-2.8 2.4-1.7 1-2.8 2.9.1z" /><path d="M8.2 12.2l2.7 2.7 5-5.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></b>
            <button className="sub num" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.tap(); toast('Address copied'); }}>
              {cfg.network === 'testnet' ? 'testnet · ' : ''}{shortAddr(addr, 4, 4)}
            </button>
          </div>
          {eggOn
            ? <button className="round glass boost-btn" aria-label="Boosts" onClick={() => nav.open({ k: 'boosts' })}><Bolt width={18} height={18} />{bonus ? <i className="num">{bonus}</i> : null}</button>
            : <span className="round ghost" aria-hidden />}
        </div>
        <div className="shadow" />
        <div className="stage"><Egg3D energy={0.2 + Math.min(0.8, lg.progress)} burst={burst} shaking={false} /></div>
      </section>

      <section className="counter">
        {first ? (
          <div className="skeleton" style={{ height: 56, width: 190, margin: '8px auto 0' }} />
        ) : eggOn ? (
          <div className="count num"><EggCoin size={44} tone="gold" />{whole}{frac && <span className="frac">.{frac}</span>}</div>
        ) : (
          <div className="count num">{formatUnits(data.ton, 9, 3)}<span className="frac"> Gram</span></div>
        )}
        {eggOn && (
          <button className="league" onClick={() => nav.setTab('friends')} aria-label="League">
            <span className="lg-emoji">{lg.cur.emoji}</span><b>{lg.cur.name}</b>{lg.next && <em className="num">· {formatUnits(lg.next.min - total, D, 0)} to {lg.next.name}</em>}<Chevron width={14} height={14} />
          </button>
        )}
      </section>

      {eggOn && <div className="energy"><span className="pbar"><i style={{ width: `${Math.max(4, lg.progress * 100)}%` }} /></span></div>}

      <div className="dock">
        <button className="dock-btn" onClick={() => { haptic.tap(); nav.open({ k: 'send' }); }}><span className="di"><Send width={24} height={24} /></span>Send</button>
        <button className="dock-btn" onClick={() => { haptic.tap(); nav.open({ k: 'receive' }); }}><span className="di"><Receive width={24} height={24} /></span>Receive</button>
        <button className="dock-btn" onClick={() => { haptic.tap(); nav.open({ k: 'swap' }); }}><span className="di"><Swap width={24} height={24} /></span>Swap</button>
      </div>

      <section className="assets">
        <div className="card asset-card">
          {eggOn && (
            <div className="asset">
              <EggCoin size={46} />
              <span className="asset-main"><b>Egg</b><small>EGG · on TON</small></span>
              <span className="asset-bal"><b className="num">{formatUnits(total, D, 2)}</b><small>EGG</small></span>
            </div>
          )}
          <div className="asset">
            <GramCoin size={46} />
            <span className="asset-main"><b>Gram</b><small>Network fees</small></span>
            <span className="asset-bal"><b className="num">{formatUnits(data.ton, 9, 3)}</b><small>Gram</small></span>
          </div>
        </div>
      </section>

      <ActivityList items={data.activity} loading={data.loading} eggOn={eggOn} onOpen={(a) => nav.open({ k: 'tx', a })} />

      <div className="notice">Your balance is public due to blockchain transparency.</div>
      <button className="link-btn" onClick={() => nav.open({ k: 'intro' })}>How does it work?</button>
      {data.error && <p className="hint bad center" style={{ marginTop: 10 }}>{data.error}</p>}
    </div>
  );
}
