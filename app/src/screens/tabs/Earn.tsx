import { useCallback, useEffect, useState } from 'react';
import { api, EarnReply, EarnTask } from '../../api/server';
import { haptic, openExternal } from '../../lib/tg';
import { useWallet } from '../../state/wallet';
import { Bar, Hero, Pips } from '../../ui/bits';
import { EggMini } from '../../ui/EggMini';
import { useToast } from '../../ui/toast';

const WHY: Record<string, string> = {
  already: 'Already done',
  'not-ready': 'Not yet: finish the task first',
  'not-joined': 'We could not see you in the channel yet',
  cap: 'Daily limit reached, come back tomorrow',
  banned: 'Your account can not earn right now',
};

/** Earn: the daily check-in with its streak, the boosts that streak and friends unlock, and one-time tasks. */
export function EarnPage() {
  const toast = useToast();
  const w = useWallet();
  const [s, setS] = useState<EarnReply | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState('');
  const [visited, setVisited] = useState<Record<string, boolean>>({});

  const load = useCallback(async (input: Record<string, unknown> = {}) => {
    try { setS(await api.earn(input)); setErr(false); return true; } catch (e) { setErr(!s); throw e; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  const act = async (id: string, input: Record<string, unknown>, ok: string) => {
    setBusy(id);
    try { await load(input); haptic.success(); toast(ok); void w.refresh(); } catch (e) { haptic.error(); toast(WHY[(e as { code?: string })?.code ?? ''] ?? 'Try again in a moment'); } finally { setBusy(''); }
  };

  const week = s ? ((Math.max(1, s.streak) - 1) % 7) + (s.streak === 0 ? 0 : 1) : 0;
  const taskBtn = (t: EarnTask) => {
    if (t.status === 'done') return <span className="done-mark">✓</span>;
    if (t.status === 'ready') return <button className="pillbtn go" disabled={busy === t.id} onClick={() => void act(t.id, { action: 'claim', id: t.id }, `+${t.reward} EGG`)}>{busy === t.id ? '…' : 'Claim'}</button>;
    if (t.link) return <button className="pillbtn" onClick={() => { openExternal(t.link!); setVisited((v) => ({ ...v, [t.id]: true })); }}>{visited[t.id] ? 'Open again' : 'Go'}</button>;
    return <span className="todo-mark">{t.progress ? `${t.progress[0]}/${t.progress[1]}` : '·'}</span>;
  };

  return (
    <div className="tab-body">
      <Hero icon={<EggMini size={64} wobble tone="gold" />} title="Earn" sub="Check in every day, finish tasks, unlock boosts." />
      {err && <p className="hint center">Earn is available inside Telegram.</p>}
      {s && (
        <>
          <section className="card daily">
            <div className="daily-top">
              <div><b>Daily check-in</b><span>{s.streak > 0 ? `${s.streak}-day streak` : 'Start your streak'}</span></div>
              <div className="daily-reward">+{s.nextDaily} <EggMini size={18} /></div>
            </div>
            <div className="week">{Array.from({ length: 7 }, (_, i) => <span key={i} className={i < week ? 'on' : ''}><i>{i + 1}</i></span>)}</div>
            <button className="bigbtn" disabled={s.checkedInToday || busy === 'daily'} onClick={() => void act('daily', { action: 'checkin' }, 'Checked in')}>
              {s.checkedInToday ? 'Come back tomorrow' : busy === 'daily' ? '…' : 'Check in'}
            </button>
          </section>

          <h2 className="sec">Boosts</h2>
          <div className="boosts">
            {s.boosts.map((b) => (
              <article key={b.id} className="card boost">
                <div className="boost-ic">{b.icon}</div>
                <div className="boost-main">
                  <div className="boost-t"><b>{b.title}</b><Pips n={b.level} max={b.max} /></div>
                  <p>{b.desc}</p>
                  <div className="boost-eff">{b.level > 0 ? b.effect : 'Not unlocked yet'}{b.level < b.max && <em> → {b.nextEffect}</em>}</div>
                  {b.level < b.max && (<><Bar value={b.have / b.need} /><small>{b.have} / {b.need} {b.unit}</small></>)}
                </div>
              </article>
            ))}
          </div>

          <h2 className="sec">Tasks</h2>
          <div className="card list">
            {s.tasks.map((t) => (
              <div key={t.id} className={`trow ${t.status}`}>
                <span className="t-ic">{t.icon}</span>
                <div className="t-main"><b>{t.title}</b><span>{t.progress && t.status !== 'done' ? <Bar value={t.progress[0] / t.progress[1]} /> : t.desc}</span></div>
                <div className="t-right"><span className="reward">+{t.reward}<EggMini size={14} /></span>{taskBtn(t)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
