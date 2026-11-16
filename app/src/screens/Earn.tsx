import { useState } from 'react';
import { api, apiErrorText, EarnReply, EarnTask } from '../api/server';
import { cfg } from '../config';
import { units, untilText } from '../lib/format';
import { haptic, openExternal } from '../lib/tg';
import { useApi } from '../lib/useApi';
import { useNav } from '../state/nav';
import { BOOST_META, BoostIcon, boostState } from '../ui/Boosts';
import { Burst } from '../ui/Egg';
import { Chick } from '../ui/Chick';
import { EggCoin } from '../ui/EggCoin';
import { Bolt, Check, Fire, Gift, Users, ShieldIc, Wallet } from '../ui/Icons';
import { useToast } from '../ui/toast';

const TASK_ICON: Record<string, React.ReactNode> = {
  wallet: <Wallet width={22} height={22} />, egg: <EggCoin size={26} />, squad: <ShieldIc width={22} height={22} />, friends: <Users width={22} height={22} />, fire: <Fire width={22} height={22} />,
};
const TASK_TINT: Record<string, [string, string]> = {
  wallet: ['#7db8ff', '#3d7cf0'], egg: ['#fff3c4', '#ffd25c'], squad: ['#5ad6c0', '#1f9d86'], friends: ['#c79bff', '#7a4fe8'], fire: ['#ffb35a', '#ff6a3d'],
};

export function EarnScreen({ earn: shared }: { earn: ReturnType<typeof useApi<EarnReply>> }) {
  const nav = useNav();
  const toast = useToast();
  const { data, setData, error, loading } = shared;
  const [busy, setBusy] = useState('');
  const [burst, setBurst] = useState(0);
  const now = data?.now ?? Date.now() / 1000;

  const run = async (key: string, input: Record<string, unknown>, ok: string) => {
    setBusy(key);
    try { setData(await api.earn(input)); haptic.success(); setBurst((b) => b + 1); nav.celebrate(); toast(ok); }
    catch (e) { haptic.error(); toast(apiErrorText(e)); }
    finally { setBusy(''); }
  };
  const go = (t: EarnTask) => {
    haptic.tap();
    if (t.id.startsWith('friend')) nav.setTab('friends');
    else if (t.id === 'squad') nav.setTab('squads');
    else if (t.id === 'wallet') nav.open({ k: 'settings' });
    else openExternal(`https://t.me/${cfg.bot}`);
  };

  if (error && !data) return (
    <div className="screen-pad"><div className="empty-card"><Chick size={90} wave /><b>Earn opens inside Telegram</b><span>Open the wallet from the bot to collect daily eggs and finish tasks.</span></div></div>
  );

  const d = data?.daily;
  const nextDay = d?.days.find((x) => x.state === 'today');
  return (
    <div className="screen-pad earn">
      <header className="page-top">
        <div><h1>Earn</h1><p>Collect eggs every day</p></div>
        <button className="boost-pill" onClick={() => nav.open({ k: 'boosts' })}><Bolt width={16} height={16} />{data ? `+${data.bonusPct}%` : 'Boosts'}</button>
      </header>

      <section className="daily-card">
        <div className="dc-art"><Chick size={98} hatching /></div>
        <div className="dc-main">
          <span className="eyebrow"><Fire width={14} height={14} />{d ? `${d.streak} day streak` : 'Daily check-in'}</span>
          <h2>Daily check-in</h2>
          <p>Come back every day: the streak makes every hatch pay more.</p>
        </div>
        <div className="week">
          {(d?.days ?? Array.from({ length: 7 }, (_, i) => ({ day: i + 1, reward: '1000000000', state: 'next' as const }))).map((x) => (
            <div key={x.day} className={`wd ${x.state}`}>
              <span className="wd-coin">{x.state === 'done' ? <span className="wd-check"><Check width={15} height={15} /></span> : <EggCoin size={26} tone={x.state === 'today' ? 'gold' : 'cream'} />}</span>
              <b className="num">+{units(x.reward, 9, 2)}</b>
              <i>Day {x.day}</i>
            </div>
          ))}
        </div>
        <div className="dc-foot">
          {burst > 0 && <Burst key={burst} />}
          <button className={`btn-gold ${d?.claimedToday ? 'done' : ''}`} disabled={!d || d.claimedToday || busy === 'daily'} onClick={() => void run('daily', { action: 'daily' }, 'Daily eggs collected')}>
            {busy === 'daily' ? <span className="spinner" /> : d?.claimedToday ? `Come back in ${untilText(d.nextAt, now)}` : nextDay ? `Collect +${units(nextDay.reward, 9, 2)} EGG` : 'Collect'}
          </button>
        </div>
      </section>

      <div className="sec-row"><h3>Boosts</h3><button onClick={() => nav.open({ k: 'boosts' })}>See all</button></div>
      <div className="boost-grid">
        {(data?.boosts ?? []).map((b) => {
          const st = boostState(b, now);
          return (
            <button key={b.id} className="boost-mini" onClick={() => nav.open({ k: 'boosts' })}>
              <BoostIcon id={b.id} size={40} />
              <b>{BOOST_META[b.id].title}</b>
              <span className={`pill ${st.tone}`}>{st.label}</span>
            </button>
          );
        })}
        {!data && Array.from({ length: 4 }, (_, i) => <div key={i} className="boost-mini skeleton" style={{ height: 112 }} />)}
      </div>

      <div className="sec-row"><h3>Tasks</h3><span className="muted">{data ? `${data.tasks.filter((t) => t.state === 'done').length}/${data.tasks.length}` : ''}</span></div>
      <div className="card task-card">
        {(data?.tasks ?? []).map((t) => {
          const tint = TASK_TINT[t.icon] ?? TASK_TINT.egg;
          return (
            <div key={t.id} className={`task ${t.state}`}>
              <span className="task-ic" style={{ background: `linear-gradient(150deg, ${tint[0]}, ${tint[1]})` }}>{TASK_ICON[t.icon] ?? <Gift width={22} height={22} />}</span>
              <span className="task-main">
                <b>{t.title}</b>
                <small>{t.need > 1 && t.state !== 'done' ? `${t.have} / ${t.need} · ` : ''}{t.sub}</small>
              </span>
              <span className="task-side">
                <span className="reward"><EggCoin size={16} />+{units(t.reward, 9, 2)}</span>
                {t.state === 'done' ? <span className="task-done"><Check width={16} height={16} /></span>
                  : t.state === 'ready' ? <button className="btn-gold sm" disabled={busy === t.id} onClick={() => void run(t.id, { action: 'task', id: t.id }, `+${units(t.reward, 9, 2)} EGG`)}>{busy === t.id ? '…' : 'Claim'}</button>
                  : <button className="btn-soft sm" onClick={() => go(t)}>Go</button>}
              </span>
            </div>
          );
        })}
        {loading && !data && Array.from({ length: 4 }, (_, i) => <div key={i} className="task"><span className="skeleton" style={{ width: 44, height: 44, borderRadius: 14 }} /><span className="task-main"><span className="skeleton" style={{ height: 14, width: '60%' }} /></span></div>)}
      </div>
    </div>
  );
}
