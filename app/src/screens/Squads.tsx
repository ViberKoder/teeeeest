import { useCallback, useEffect, useState } from 'react';
import { api, SquadReply } from '../api/server';
import { cfg } from '../config';
import { formatUnits } from '../lib/format';
import { confirmNative, haptic, openExternal, shareLink } from '../lib/tg';
import { Avatar, copyText, Hero, Seg } from '../ui/bits';
import { Coin, EggMini } from '../ui/EggMini';
import { useToast } from '../ui/toast';

const WHY: Record<string, string> = {
  'bad-name': 'Use 3–24 letters, digits, spaces, _ . -',
  'bad-link': 'A link must look like https://t.me/yourchat',
  'name-taken': 'This name is taken',
  'hatch-first': 'Hatch an egg first: squads are for people who play',
  'leave-first': 'Leave your squad first',
  cooldown: 'You can change squads once a day',
  full: 'This squad is full',
  'no-squad': 'This squad no longer exists',
  banned: 'Your account can not join squads',
  busy: 'Too many squads were created today, try tomorrow',
};
const why = (e: unknown) => WHY[(e as { code?: string })?.code ?? ''] ?? 'Something went wrong, try again';
const egg = (u: string, f = 1) => formatUnits(BigInt(u || '0'), cfg.token.decimals, f);
const left = (endsAt: number) => { const s = Math.max(0, endsAt - Math.floor(Date.now() / 1000)); return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`; };
const MEDAL = ['🥇', '🥈', '🥉'];

/** Squads: a podium of the week's best three, the full leaderboard, and your own squad with its members and invite links. */
export function SquadsPage({ joinId }: { joinId?: number | null }) {
  const toast = useToast();
  const [s, setS] = useState<SquadReply | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'top' | 'mine'>('top');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: number; name: string; members: number }[]>([]);
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.squad({ action: 'state' }); setS(r); setErr(''); if (!picked) { setView(r.me ? 'mine' : 'top'); setPicked(true); } } catch { setErr('Squads are available inside Telegram.'); }
  }, [picked]);
  useEffect(() => { void load(); }, [load]);

  const act = async (input: Record<string, unknown>, done: string) => {
    setBusy(true);
    try { const r = await api.squad(input); setS(r); haptic.success(); toast(done); setCreating(false); setView(r.me ? 'mine' : 'top'); } catch (e) { haptic.error(); toast(why(e)); } finally { setBusy(false); }
  };
  const join = async (id: number, title: string) => {
    if (!(await confirmNative(`Join “${title}”? You can change squads once a day.`))) return;
    await act({ action: 'join', id }, `Joined ${title}`);
  };

  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!joinId || asked || !s || s.me?.id === joinId) return;
    setAsked(true);
    void api.squad({ action: 'info', id: joinId }).then((r) => { if (r.squad) void join(r.squad.id, r.squad.name); }).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinId, s, asked]);

  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => { void api.squad({ action: 'find', q }).then((r) => setFound(r.found ?? [])).catch(() => setFound([])); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const me = s?.me ?? null;
  const inviteLink = me ? `https://t.me/${cfg.bot}?startapp=squad_${me.id}` : '';
  const top3 = s?.board.slice(0, 3) ?? [];
  const order = [top3[1], top3[0], top3[2]]; // podium: 2nd, 1st, 3rd
  const H = [96, 128, 78];

  return (
    <div className="tab-body">
      <Hero icon={<EggMini size={68} wobble />} title="Squads" sub={s ? `Week ends in ${left(s.endsAt)} · best 3 squads win ${s.prizes.join(' / ')} EGG per player` : 'Hatch together'} />
      {err && <p className="hint center">{err}</p>}
      {s && (
        <>
          <Seg value={view} onChange={setView} items={[['top', 'Leaderboard'], ['mine', me ? 'My squad' : 'Join or create']]} />

          {view === 'top' && (
            <>
              {top3.length > 0 && (
                <div className="podium">
                  {order.map((b, i) => b ? (
                    <button key={b.id} className={`pod p${[2, 1, 3][i]}`} onClick={me?.id === b.id ? undefined : () => void join(b.id, b.name)}>
                      <Coin tone="egg"><EggMini size={i === 1 ? 40 : 32} tone={i === 1 ? 'gold' : 'cream'} wobble={i === 1} /></Coin>
                      <b>{b.name}</b><span>{egg(b.score)} EGG</span>
                      <div className="pod-bar" style={{ height: H[i] }}><i>{MEDAL[[1, 0, 2][i]]}</i></div>
                    </button>
                  ) : <span key={i} className="pod empty" />)}
                </div>
              )}
              <div className="card list">
                {s.board.length === 0 && <div className="empty-state"><EggMini size={52} wobble /><b>No squads yet</b><span>Be the first: create one and invite your friends.</span></div>}
                {s.board.slice(3).map((b) => (
                  <button key={b.id} className={`srow ${me?.id === b.id ? 'mine' : ''}`} onClick={me?.id === b.id ? undefined : () => void join(b.id, b.name)}>
                    <span className="rk">{b.rank}</span>
                    <Avatar name={b.name} id={b.id} />
                    <span className="s-main"><b>{b.name}{me?.id === b.id ? ' · yours' : ''}</b><span>{b.members} members</span></span>
                    <span className="s-score num">{egg(b.score)} <EggMini size={13} /></span>
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'mine' && me && (
            <>
              <section className="squad-hero">
                <div className="sq-emblem"><EggMini size={58} tone="gold" wobble /><i>{Array.from(me.name)[0]?.toUpperCase()}</i></div>
                <h2>{me.name}</h2>
                <div className="sq-stats">
                  <div><b>#{me.rank ?? '—'}</b><span>this week</span></div>
                  <div><b>{egg(me.score)}</b><span>EGG earned</span></div>
                  <div><b>{me.members}</b><span>members</span></div>
                </div>
                <div className="sq-actions">
                  <button className="bigbtn light" onClick={() => shareLink(inviteLink, `Join my squad “${me.name}” and hatch EGG together 🥚`)}>Invite friends</button>
                  <button className="bigbtn glass" onClick={() => { copyText(inviteLink); haptic.success(); toast('Invite link copied'); }}>Copy link</button>
                </div>
                {me.link && <button className="sq-chat" onClick={() => openExternal(me.link!)}>Open the squad chat ›</button>}
              </section>
              <h2 className="sec">Members this week</h2>
              <div className="card list">
                {(s.members ?? []).map((m) => (
                  <div key={m.id} className="srow">
                    <span className="rk">{MEDAL[m.rank - 1] ?? m.rank}</span>
                    <Avatar name={m.name} id={m.id} />
                    <span className="s-main"><b>{m.name}</b><span>{egg(m.total, 0)} EGG in total</span></span>
                    <span className="s-score num">+{egg(m.earned)} <EggMini size={13} /></span>
                  </div>
                ))}
              </div>
              <button className="bigbtn danger" style={{ marginTop: 14 }} onClick={() => { void confirmNative(`Leave “${me.name}”? You can join another squad after a day.`).then(async (ok) => { if (ok) await act({ action: 'leave' }, 'You left the squad'); }); }}>Leave squad</button>
            </>
          )}

          {view === 'mine' && !me && (
            <>
              <div className="card empty-state"><EggMini size={60} wobble tone="gold" /><b>Hatch with a team</b><span>A squad’s score is the EGG its members earn. The best three squads of the week win EGG.</span></div>
              <h2 className="sec">Create a squad</h2>
              <div className="card form">
                {creating ? (
                  <>
                    <label>Name<input maxLength={24} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Golden Yolks" /></label>
                    <label>Chat or channel link (optional)<input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/…" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                    <button className="bigbtn" disabled={busy || name.trim().length < 3} onClick={() => void act({ action: 'create', name, link }, 'Squad created')}>{busy ? '…' : 'Create squad'}</button>
                  </>
                ) : <button className="bigbtn" onClick={() => setCreating(true)}>New squad</button>}
              </div>
              <h2 className="sec">Find a squad</h2>
              <div className="card form">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                {found.map((f) => (
                  <button key={f.id} className="srow" onClick={() => void join(f.id, f.name)}><Avatar name={f.name} id={f.id} /><span className="s-main"><b>{f.name}</b><span>{f.members} members</span></span><span className="pillbtn go">Join</span></button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
