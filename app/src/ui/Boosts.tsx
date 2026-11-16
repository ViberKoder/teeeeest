import { ReactNode } from 'react';
import type { EarnBoost } from '../api/server';
import { untilText } from '../lib/format';
import { Fire, Calendar, ShieldIc, Users } from './Icons';

export const BOOST_META: Record<EarnBoost['id'], { title: string; icon: ReactNode; from: string; to: string; blurb: (b: EarnBoost) => string }> = {
  warmup: { title: 'Warm-up', icon: <Fire width={22} height={22} />, from: '#ffb35a', to: '#ff6a3d', blurb: (b) => `x2 on every hatch for ${Math.round((b.secs ?? 3600) / 60)} minutes. Free, once a day.` },
  streak: { title: 'Streak', icon: <Calendar width={22} height={22} />, from: '#ffd84d', to: '#f0a312', blurb: (b) => `+${b.per ?? 3}% for each day in a row, up to +${b.max ?? 30}%.` },
  squad: { title: 'Squad spirit', icon: <ShieldIc width={22} height={22} />, from: '#5ad6c0', to: '#1f9d86', blurb: (b) => `+${b.max ?? 10}% while you are in a squad.` },
  brood: { title: 'Brood', icon: <Users width={22} height={22} />, from: '#7db8ff', to: '#3d7cf0', blurb: (b) => `+${b.per ?? 5}% for every friend who plays, up to +${b.max ?? 25}%.` },
};

export function boostState(b: EarnBoost, now = Date.now() / 1000): { label: string; tone: 'on' | 'ready' | 'idle' } {
  if (b.id === 'warmup') {
    if (b.active && b.active > now) return { label: `${untilText(b.active, now)} left`, tone: 'on' };
    if (b.ready) return { label: 'Ready', tone: 'ready' };
    return { label: `in ${untilText(b.nextAt ?? now, now)}`, tone: 'idle' };
  }
  return b.pct > 0 ? { label: `+${b.pct}%`, tone: 'on' } : { label: 'Off', tone: 'idle' };
}

/** What fills a boost's bar (0..1), or null when it is on/off. */
export function boostFill(b: EarnBoost): number | null {
  if (b.id === 'streak') return Math.min(1, b.pct / (b.max ?? 30));
  if (b.id === 'brood') return Math.min(1, b.pct / (b.max ?? 25));
  return null;
}

export function BoostIcon({ id, size = 44 }: { id: EarnBoost['id']; size?: number }) {
  const m = BOOST_META[id];
  return <span className="boost-ic" style={{ width: size, height: size, background: `linear-gradient(150deg, ${m.from}, ${m.to})` }}>{m.icon}</span>;
}
