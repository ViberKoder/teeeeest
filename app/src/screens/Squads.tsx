import { useCallback, useEffect, useState } from 'react';
import { api, SquadReply } from '../api/server';
import { cfg } from '../config';
import { units, untilText } from '../lib/format';
import { hueOf } from '../lib/league';
import { confirmNative, haptic, openExternal, shareLink, tgUserId } from '../lib/tg';
import { useNav } from '../state/nav';
import { Crest } from '../ui/Crest';
import { EggCoin } from '../ui/EggCoin';
import { Chevron, Globe, Plus, Share } from '../ui/Icons';
import { Sheet } from '../ui/Sheet';
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
const egg = (u: string) => units(u || '0', 9, 0);
const MEDAL = ['1', '2', '3'];

export function SquadsScreen() {
  const toast = useToast();
  const nav = useNav();
  const [s, setS] = useState<SquadReply | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [finding, setFinding] = useState(false);

  const load = useCallback(async () => {
    try { setS(await api.squad({ action: 'state' })); setErr(''); } catch { setErr('Squads open inside Telegram.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (input: Record<string, unknown>, done: string) => {
    setBusy(true);
    try { setS(await api.squad(input)); haptic.success(); toast(done); setCreating(false); setFinding(false); nav.celebrate(); } catch (e) { haptic.error(); toast(why(e)); } finally { setBusy(false); }
  };
  const join = async (id: number, title: string) => {
    if (!(await confirmNative(`Join “${title}”? You can change squads once a day.`))) return;
    await act({ action: 'join', id }, `Joined ${title}`);
  };

  // a friend's invitation link opens right here
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!nav.joinId || asked || !s || s.me?.id === nav.joinId) return;
    setAsked(true);
    void api.squad({ action: 'info', id: nav.joinId }).then((r) => { if (r.squad) void join(r.squad.id, r.squad.name); }).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.joinId, s, asked]);

  const me = s?.me ?? null;
  const invite = () => { if (me) { haptic.tap(); shareLink(`https://t.me/${cfg.bot}?startapp=squad_${me.id}`, `Join my squad “${me.name}” and hatch EGG together 🥚`); } };
  const left = s ? untilText(s.endsAt) : '';
  const board = s?.board ?? [];

  return (
    <div className="screen-pad squads">
      <header className="page-top">
        <div><h1>Squads</h1><p>Hatch as a team, win every week</p></div>
        {s && <span className="timer-pill">{left} left</span>}
      </header>

      {err && !s && <div className="empty-card"><EggCoin size={60} float /><b>{err}</b><span>Open the wallet from the bot to join a squad.</span></div>}

      {s && me && (
        <section className="squad-hero">
          <div className="sh-top">
            <Crest name={me.name} size={64} />
            <div className="sh-name"><h2>{me.name}</h2><span className="rank-chip">#{me.rank ?? '—'} this week</span></div>
          </div>
          <div className="sh-stats">
            <div><b className="num">{egg(me.score)}</b><small>EGG this week</small></div>
            <div><b className="num">{me.members}</b><small>members</small></div>
            <div><b className="num">{s.prizes[0] ?? '—'}</b><small>top prize</small></div>
          </div>
          <div className="sh-actions">
            <button className="btn-main" onClick={invite}><Share width={19} height={19} />Invite friends</button>
            {me.link && <button className="btn-glass wide" onClick={() => openExternal(me.link!)}>Squad chat</button>}
          </div>
        </section>
      )}

      {s && !me && (
        <section className="squad-hero empty">
          <h2>Hatch together</h2>
          <p>A squad’s score is the EGG its members hatch. The three best squads win every week.</p>
          <div className="prize-row">
            {s.prizes.slice(0, 3).map((p, i) => <span key={i}><small>{MEDAL[i]} place</small><b className="num">{p} EGG</b></span>)}
          </div>
          <div className="sh-actions">
            <button className="btn-main" onClick={() => setCreating(true)}><Plus width={19} height={19} />Create a squad</button>
            <button className="btn-glass wide" onClick={() => setFinding(true)}>Find one</button>
          </div>
        </section>
      )}

      {s && (
        <>
          <div className="sec-row"><h3>Leaderboard</h3>{!me && <button onClick={() => setFinding(true)}>Search</button>}</div>
          <div className="card board-card">
            {board.length === 0 && <div className="empty-mini">No squads yet. Create the first one.</div>}
            {board.map((b) => (
              <button key={b.id} className={`brow ${me?.id === b.id ? 'me' : ''}`} onClick={() => (me?.id === b.id ? undefined : void join(b.id, b.name))}>
                <span className={`rank num ${b.rank <= 3 ? `m${b.rank}` : ''}`}>{b.rank}</span>
                <Crest name={b.name} size={42} egg={false} />
                <span className="brow-main"><b>{b.name}{me?.id === b.id ? ' · yours' : ''}</b><small>{b.members} members</small></span>
                <span className="brow-score num"><EggCoin size={15} />{egg(b.score)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {s && me && (s.members?.length ?? 0) > 0 && (
        <>
          <div className="sec-row"><h3>Your squad</h3><span className="muted">who hatched most this week</span></div>
          <div className="card board-card">
            {s.members!.map((r) => (
              <div key={r.id} className={`brow ${r.id === tgUserId() ? 'me' : ''}`}>
                <span className="rank num">{r.rank}</span>
                <span className="avatar lg" style={{ ['--h' as string]: hueOf(r.name) }}>{(r.name[0] ?? '#').toUpperCase()}</span>
                <span className="brow-main"><b>{r.id === tgUserId() ? 'You' : r.name}</b><small>{egg(r.total)} EGG in total</small></span>
                <span className="brow-score num"><EggCoin size={15} />{egg(r.earned)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="map-entry" onClick={() => nav.open({ k: 'map' })}>
        <span className="me-ic"><Globe width={24} height={24} /></span>
        <span><b>Egg map</b><small>See where the eggs are hatching right now</small></span>
        <Chevron width={18} height={18} />
      </button>

      {s && me && (
        <button className="leave" onClick={() => { void confirmNative(`Leave “${me.name}”? You can join another squad after a day.`).then(async (ok) => { if (ok) await act({ action: 'leave' }, 'You left the squad'); }); }}>Leave squad</button>
      )}

      {creating && <CreateSheet busy={busy} onClose={() => setCreating(false)} onCreate={(name, link) => void act({ action: 'create', name, link }, 'Squad created')} />}
      {finding && <FindSheet onClose={() => setFinding(false)} onJoin={(id, n) => void join(id, n)} />}
    </div>
  );
}

function CreateSheet({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (name: string, link: string) => void }) {
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const ok = name.trim().length >= 3;
  return (
    <Sheet onClose={onClose} title="New squad" footer={<button className="mainbtn inline accent" disabled={!ok || busy} onClick={() => onCreate(name, link)}>{busy ? <span className="spinner" /> : 'Create squad'}</button>}>
      <div className="create-art">{name.trim().length >= 2 ? <Crest name={name} size={84} /> : <EggCoin size={64} float />}</div>
      <div className="field-card"><label>Name</label><input className="input big" maxLength={24} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Golden Yolks" /></div>
      <div className="field-card"><label>Chat or channel (optional)</label><input className="input big" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/…" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
      <p className="foot-note">Squads are for people who play: you need to have hatched at least one egg.</p>
    </Sheet>
  );
}

function FindSheet({ onClose, onJoin }: { onClose: () => void; onJoin: (id: number, name: string) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: number; name: string; members: number }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => { void api.squad({ action: 'find', q }).then((r) => setFound(r.found ?? [])).catch(() => setFound([])); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Sheet onClose={onClose} title="Find a squad" tall>
      <div className="field-card"><input className="input big" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
      <div className="card list-card" style={{ marginTop: 12 }}>
        {found.map((f) => <button key={f.id} className="pick" onClick={() => onJoin(f.id, f.name)}><Crest name={f.name} size={42} egg={false} /><span><b>{f.name}</b><small>{f.members} members</small></span><em>Join</em></button>)}
        {found.length === 0 && <div className="empty-mini">{q.trim().length < 2 ? 'Type at least two letters' : 'No squads found'}</div>}
      </div>
    </Sheet>
  );
}
