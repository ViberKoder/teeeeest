import { useState } from 'react';
import { api, apiErrorText, EarnReply, EarnTask } from '../api/server';
import { haptic, openExternal } from '../lib/tg';
import { useApi } from '../lib/useApi';
import { useNav } from '../state/nav';
import { BoostIcon, Pips } from '../ui/Boosts';
import { Burst } from '../ui/Egg';
import { EggCoin } from '../ui/EggCoin';
import { Bolt, Check, EggLine, ShieldIc, Users, Wallet, Info } from '../ui/Icons';
import { useToast } from '../ui/toast';

/** the server's rule: day n of a streak pays min(10, 2 + n) / 2 EGG */
export function TaskIcon({ id }: { id: string }) {
  if (id === 'wallet') return <Wallet width={22} height={22} />;
  if (id === 'squad') return <ShieldIc width={22} height={22} />;
  if (id === 'send1') return <EggLine width={22} height={22} />;
  if (id.startsWith('friend')) return <Users width={22} height={22} />;
  return <Info width={22} height={22} />;
}
const reward = (n: number) => Math.min(10, 2 + n) / 2;
const fmt = (n: number) => String(n);

export function EarnScreen({ earn: shared }: { earn: ReturnType<typeof useApi<EarnReply>> }) {
  const nav = useNav();
  const toast = useToast();
  const { data, setData, error, loading } = shared;
  const [busy, setBusy] = useState('');
  const [burst, setBurst] = useState(0);

  const run = async (key: string, input: Record<string, unknown>, ok: string, link?: string | null) => {
    setBusy(key);
    try { setData(await api.earn(input)); haptic.success(); setBurst((b) => b + 1); nav.celebrate(); toast(ok); }
    catch (e) {
      haptic.error(); toast(apiErrorText(e));
      if ((e as { code?: string }).code === 'not-joined' && link) openExternal(link);
    } finally { setBusy(''); }
  };
  const go = (t: EarnTask) => {
    haptic.tap();
    if (t.link) openExternal(t.link);
    else if (t.id.startsWith('friend')) nav.setTab('friends');
    else if (t.id === 'squad') nav.setTab('squads');
    else if (t.id === 'wallet') nav.open({ k: 'settings' });
  };

  if (error && !data) return (
    <div className="screen-pad"><div className="empty-card"><EggCoin size={64} float /><b>Earn opens inside Telegram</b><span>Open the wallet from the bot to collect daily eggs and finish tasks.</span></div></div>
  );

  const streak = data?.streak ?? 0;
  const today = data?.checkedInToday ?? false;
  const done = today ? ((streak - 1) % 7) + 1 : streak % 7; // tiles already collected in this week of the streak
  const base = streak - done;
  const week = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, n: base + i + 1, state: i < done ? 'done' : i === done && !today ? 'today' : 'next' }));

  return (
    <div className="screen-pad earn">
      <header className="page-top">
        <div><h1>Earn</h1><p>Collect eggs every day</p></div>
        <button className="boost-pill" onClick={() => nav.open({ k: 'boosts' })}><Bolt width={16} height={16} />Boosts</button>
      </header>

      <section className="card daily">
        <div className="daily-head">
          <div><b>Daily check-in</b><small>{data ? `${streak} day streak` : ' '}</small></div>
          {data && !today && <span className="daily-next num">+{data.nextDaily} EGG</span>}
        </div>
        <div className="week">
          {week.map((x) => (
            <div key={x.day} className={`wd ${x.state}`}>
              <span className="wd-coin">{x.state === 'done' ? <span className="wd-check"><Check width={14} height={14} /></span> : <EggCoin size={24} />}</span>
              <b className="num">+{fmt(reward(x.n))}</b>
            </div>
          ))}
        </div>
        <div className="dc-foot">
          {burst > 0 && <Burst key={burst} />}
          <button className="btn-main wide" disabled={!data || today || busy === 'checkin'} onClick={() => void run('checkin', { action: 'checkin' }, 'Daily eggs collected')}>
            {busy === 'checkin' ? <span className="spinner" /> : today ? 'Come back tomorrow' : data ? `Collect ${data.nextDaily} EGG` : 'Collect'}
          </button>
        </div>
      </section>

      <div className="sec-row"><h3>Boosts</h3><button onClick={() => nav.open({ k: 'boosts' })}>See all</button></div>
      <div className="boost-grid">
        {(data?.boosts ?? []).map((b) => (
          <button key={b.id} className="boost-mini" onClick={() => nav.open({ k: 'boosts' })}>
            <BoostIcon b={b} size={40} />
            <b>{b.title}</b>
            <Pips level={b.level} max={b.max} />
            <small className="muted">{b.level > 0 ? b.effect : `Next: ${b.nextEffect}`}</small>
          </button>
        ))}
        {!data && Array.from({ length: 2 }, (_, i) => <div key={i} className="boost-mini skeleton" style={{ height: 132 }} />)}
      </div>

      <div className="sec-row"><h3>Tasks</h3><span className="muted">{data ? `${data.tasks.filter((t) => t.status === 'done').length}/${data.tasks.length}` : ''}</span></div>
      <div className="card task-card">
        {(data?.tasks ?? []).map((t, i) => {
          void i;
          return (
            <div key={t.id} className={`task ${t.status}`}>
              <span className="task-ic"><TaskIcon id={t.id} /></span>
              <span className="task-main">
                <b>{t.title}</b>
                <small>{t.progress && t.status !== 'done' ? `${t.progress[0]} / ${t.progress[1]} · ` : ''}{t.desc}</small>
              </span>
              <span className="task-side">
                <span className="reward"><EggCoin size={16} />+{t.reward}</span>
                {t.status === 'done' ? <span className="task-done"><Check width={16} height={16} /></span>
                  : t.status === 'ready' ? <button className="btn-main sm" disabled={busy === t.id} onClick={() => void run(t.id, { action: 'claim', id: t.id }, `+${t.reward} EGG`, t.link)}>{busy === t.id ? '…' : 'Claim'}</button>
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
