import { ReactNode } from 'react';
import { haptic } from '../lib/tg';
import { Bolt, EggLine, ShieldIc, Users } from './Icons';

export type Tab = 'wallet' | 'earn' | 'squads' | 'friends';
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'wallet', label: 'Nest', icon: <EggLine width={26} height={26} /> },
  { id: 'earn', label: 'Earn', icon: <Bolt width={25} height={25} /> },
  { id: 'squads', label: 'Squads', icon: <ShieldIc width={25} height={25} /> },
  { id: 'friends', label: 'Friends', icon: <Users width={26} height={26} /> },
];

/** The bottom bar: translucent, like Telegram's own tab bars, with a lit pill behind the active tab. */
export function TabBar({ tab, onTab, dots }: { tab: Tab; onTab: (t: Tab) => void; dots?: Partial<Record<Tab, boolean>> }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((t) => (
        <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => { if (tab !== t.id) haptic.select(); onTab(t.id); }} aria-current={tab === t.id}>
          <span className="ti">{t.icon}{dots?.[t.id] && <i className="dot" />}</span>
          <span className="tl">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
