import { useEffect, useState } from 'react';
import { api } from '../api/server';
import { refFromLink, squadFromLink } from '../lib/tg';
import { Home } from './Home';
import { EarnPage } from './tabs/Earn';
import { FriendsPage } from './tabs/Friends';
import { SquadsPage } from './Squads';
import { WorldPage } from './MapPage';
import { haptic } from '../lib/tg';

type Tab = 'wallet' | 'earn' | 'squads' | 'friends' | 'world';

const I = (d: string) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'wallet', label: 'Egg', icon: I('M12 2.5C16.5 2.5 19.5 9.5 19.5 14.5c0 4-3.4 7-7.5 7s-7.5-3-7.5-7C4.5 9.5 7.5 2.5 12 2.5Z') },
  { id: 'earn', label: 'Earn', icon: I('M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8z') },
  { id: 'squads', label: 'Squads', icon: I('M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z') },
  { id: 'friends', label: 'Friends', icon: I('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.3 3.2-5 6.5-5s5.9 1.7 6.5 5M16 4.4a3.5 3.5 0 0 1 0 6.2M18.5 15.4c1.6.6 2.7 2 3 4.6') },
  { id: 'world', label: 'World', icon: I('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3c2.6 2.4 3.9 5.4 3.9 9S14.6 18.6 12 21c-2.6-2.4-3.9-5.4-3.9-9S9.4 5.4 12 3z') },
];

/** The wallet and the game in one app: five tabs, the egg wallet first. */
export function Shell() {
  const [joinId] = useState<number | null>(() => squadFromLink());
  const [tab, setTab] = useState<Tab>(joinId ? 'squads' : 'wallet');
  // a friend's invitation (t.me/<bot>?startapp=ref_<id>): the inviter is recorded once, quietly
  useEffect(() => { const r = refFromLink(); if (r) void api.friends({ action: 'ref', id: r }).catch(() => undefined); }, []);
  return (
    <div className="shell">
      <div className="tabview" key={tab}>
        {tab === 'wallet' && <Home />}
        {tab === 'earn' && <EarnPage />}
        {tab === 'squads' && <SquadsPage joinId={joinId} />}
        {tab === 'friends' && <FriendsPage />}
        {tab === 'world' && <WorldPage />}
      </div>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { if (tab !== t.id) { haptic.select(); setTab(t.id); window.scrollTo({ top: 0 }); } }}>
            <span className="ti">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
