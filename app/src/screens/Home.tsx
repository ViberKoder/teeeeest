import { lazy, Suspense, useCallback, useState } from 'react';
import { api, EarnReply } from '../api/server';
import { squadFromLink } from '../lib/tg';
import { useApi } from '../lib/useApi';
import { Nav, NavCtx, Overlay } from '../state/nav';
import { useAutoHatch } from '../state/autoHatch';
import { useWallet } from '../state/wallet';
import { TabBar, Tab } from '../ui/TabBar';
import { Nest } from './Nest';
// every other screen loads on first use: the wallet opens without waiting for them
const EarnScreen = lazy(() => import('./Earn').then((m) => ({ default: m.EarnScreen })));
const SquadsScreen = lazy(() => import('./Squads').then((m) => ({ default: m.SquadsScreen })));
const FriendsScreen = lazy(() => import('./Friends').then((m) => ({ default: m.FriendsScreen })));
const MapPage = lazy(() => import('./MapPage').then((m) => ({ default: m.MapPage })));
const SettingsPage = lazy(() => import('./Settings').then((m) => ({ default: m.SettingsPage })));
const IntroPage = lazy(() => import('./Intro').then((m) => ({ default: m.IntroPage })));
const SendSheet = lazy(() => import('../sheets/SendSheet').then((m) => ({ default: m.SendSheet })));
const ReceiveSheet = lazy(() => import('../sheets/ReceiveSheet').then((m) => ({ default: m.ReceiveSheet })));
const SwapSheet = lazy(() => import('../sheets/SwapSheet').then((m) => ({ default: m.SwapSheet })));
const TxSheet = lazy(() => import('../sheets/TxSheet').then((m) => ({ default: m.TxSheet })));
const BoostsSheet = lazy(() => import('../sheets/BoostsSheet').then((m) => ({ default: m.BoostsSheet })));

/** The wallet once it is open: four tabs, and every other screen (send, receive, swap, a transaction, boosts, settings) on top of them. */
export function Home() {
  const w = useWallet();
  useAutoHatch();
  // a "send" link from the bot (/send @user 10) opens Send prefilled — the user still confirms it with their own key
  const [prefill] = useState(() => {
    const q = new URLSearchParams(location.search);
    if (!q.get('send')) return null;
    const p = { to: q.get('send') ?? '', amount: q.get('amount') ?? '' };
    history.replaceState(null, '', location.pathname + location.hash); // once: a reload must not reopen it
    return p;
  });
  const [joinId] = useState<number | null>(() => squadFromLink());
  const [tab, setTab] = useState<Tab>(joinId ? 'squads' : 'wallet');
  const [seen, setSeen] = useState<Set<Tab>>(() => new Set<Tab>([joinId ? 'squads' : 'wallet']));
  const [overlay, setOverlay] = useState<Overlay>(prefill ? { k: 'send', to: prefill.to, amount: prefill.amount } : w.firstRun ? { k: 'intro' } : null);
  const [burst, setBurst] = useState(0);
  const earn = useApi<EarnReply>(() => api.earn({ action: 'state' }), []);

  const nav: Nav = {
    tab,
    setTab: (t) => { setSeen((s) => new Set(s).add(t)); setTab(t); window.scrollTo({ top: 0 }); },
    open: (o) => setOverlay(o),
    close: useCallback(() => { setOverlay(null); w.dismissIntro(); }, [w]),
    joinId,
    celebrate: () => setBurst((b) => b + 1),
  };
  if (!w.provider) return null;
  const eggOn = Boolean(w.masterAddress);
  const canClaimDaily = earn.data ? !earn.data.daily.claimedToday : false;
  const tabs: Tab[] = eggOn ? ['wallet', 'earn', 'squads', 'friends'] : ['wallet'];

  return (
    <NavCtx.Provider value={nav}>
      <div className="shell">
        <div className="pane" hidden={tab !== 'wallet'}><Nest burst={burst} bonus={earn.data?.bonusPct ?? null} /></div>
        <Suspense fallback={null}>
          {eggOn && seen.has('earn') && <div className="pane" hidden={tab !== 'earn'}><EarnScreen earn={earn} /></div>}
          {eggOn && seen.has('squads') && <div className="pane" hidden={tab !== 'squads'}><SquadsScreen /></div>}
          {eggOn && seen.has('friends') && <div className="pane" hidden={tab !== 'friends'}><FriendsScreen /></div>}
        </Suspense>
      </div>
      {tabs.length > 1 && <TabBar tab={tab} onTab={nav.setTab} dots={{ earn: canClaimDaily }} />}

      <Suspense fallback={null}>
        {overlay?.k === 'send' && <SendSheet onClose={nav.close} asset={overlay.asset} initialTo={overlay.to} initialAmount={overlay.amount} />}
        {overlay?.k === 'receive' && <ReceiveSheet onClose={nav.close} asset={overlay.asset} />}
        {overlay?.k === 'swap' && <SwapSheet onClose={nav.close} />}
        {overlay?.k === 'tx' && <TxSheet a={overlay.a} onClose={nav.close} />}
        {overlay?.k === 'boosts' && <BoostsSheet onClose={nav.close} earn={earn.data} onChange={(e) => earn.setData(e)} />}
        {overlay?.k === 'settings' && <SettingsPage onClose={nav.close} />}
        {overlay?.k === 'intro' && <IntroPage onClose={nav.close} />}
        {overlay?.k === 'map' && <MapPage onClose={nav.close} />}
      </Suspense>
    </NavCtx.Provider>
  );
}
