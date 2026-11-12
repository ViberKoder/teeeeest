import { useCallback, useEffect, useState } from 'react';
import { api, SquadReply } from '../api/server';
import { cfg } from '../config';
import { formatUnits } from '../lib/format';
import { confirmNative, haptic, openExternal, shareLink } from '../lib/tg';
import { Page, Row, Section } from '../ui/native';
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
const egg = (u: string) => formatUnits(BigInt(u || '0'), cfg.token.decimals, 2);
const left = (endsAt: number) => { const s = Math.max(0, endsAt - Math.floor(Date.now() / 1000)); return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`; };
const ic = (n: React.ReactNode) => <span className="row-icon icon-soft">{n}</span>;

export function SquadsPage({ onClose, joinId }: { onClose: () => void; joinId?: number | null }) {
  const toast = useToast();
  const [s, setS] = useState<SquadReply | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: number; name: string; members: number }[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setS(await api.squad({ action: 'state' })); setErr(''); } catch { setErr('Squads are available inside Telegram.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (input: Record<string, unknown>, done: string) => {
    setBusy(true);
    try { setS(await api.squad(input)); haptic.success(); toast(done); setCreating(false); } catch (e) { haptic.error(); toast(why(e)); } finally { setBusy(false); }
  };
  const join = async (id: number, title: string) => {
    if (!(await confirmNative(`Join “${title}”? You can change squads once a day.`))) return;
    await act({ action: 'join', id }, `Joined ${title}`);
  };

  // a friend's invitation link opens right here
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
  const invite = () => me && shareLink(`https://t.me/${cfg.bot}?startapp=squad_${me.id}`, `Join my squad “${me.name}” and hatch EGG together 🥚`);

  return (
    <Page title="Squads" onBack={onClose}>
      {err && <p className="hint center" style={{ padding: 24 }}>{err}</p>}
      {s && (
        <>
          {me ? (
            <div className="squad-hero">
              <div className="sq-name">🛡 {me.name}</div>
              <div className="sq-stats">
                <div><b>#{me.rank ?? '—'}</b><span>this week</span></div>
                <div><b>{egg(me.score)}</b><span>EGG earned</span></div>
                <div><b>{me.members}</b><span>members</span></div>
              </div>
              <div className="stack" style={{ marginTop: 14 }}>
                <button className="btn" onClick={invite}>Invite friends</button>
                {me.link && <button className="btn soft" onClick={() => openExternal(me.link!)}>Open squad chat</button>}
              </div>
            </div>
          ) : (
            <p className="hint center" style={{ padding: '6px 20px 14px', fontSize: 16 }}>Hatch together: a squad’s score is the EGG its members earn. The best three squads of the week win EGG ({s.prizes.join(' / ')} each).</p>
          )}

          {!me && (
            <Section title="Create a squad">
              {creating ? (
                <>
                  <div className="field"><label>Name</label><input className="input" maxLength={24} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Golden Yolks" /></div>
                  <div className="field"><label>Chat or channel link (optional)</label><input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/…" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
                  <div style={{ padding: 12 }}><button className="btn" disabled={busy || name.trim().length < 3} onClick={() => void act({ action: 'create', name, link }, 'Squad created')}>{busy ? '…' : 'Create squad'}</button></div>
                </>
              ) : (
                <Row onClick={() => setCreating(true)} icon={ic(<span>➕</span>)} title="New squad" subtitle="Be the first of your friends" />
              )}
            </Section>
          )}

          {!me && (
            <Section title="Find a squad">
              <div className="field"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
              {found.map((f) => <Row key={f.id} onClick={() => void join(f.id, f.name)} icon={ic(<span>🛡</span>)} title={f.name} subtitle={`${f.members} members`} trailing={<span style={{ color: 'var(--accent-text)' }}>Join</span>} />)}
            </Section>
          )}

          <Section title={`Leaderboard · ${left(s.endsAt)} left`} footer="One week, Monday to Sunday (UTC). A squad scores what its members earn while they are in it.">
            {s.board.length === 0 && <Row title="No squads yet" subtitle="Create the first one" />}
            {s.board.map((b) => (
              <Row key={b.id} onClick={me?.id === b.id ? undefined : () => void join(b.id, b.name)}
                icon={ic(<span>{['🥇', '🥈', '🥉'][b.rank - 1] ?? b.rank}</span>)}
                title={<span>{b.name}{me?.id === b.id ? ' · yours' : ''}</span>} subtitle={`${b.members} members`}
                trailing={<span className="num">{egg(b.score)}</span>} />
            ))}
          </Section>

          {me && (
            <Section>
              <Row tone="danger" onClick={() => { void confirmNative(`Leave “${me.name}”? You can join another squad after a day.`).then(async (ok) => { if (ok) await act({ action: 'leave' }, 'You left the squad'); }); }} title="Leave squad" />
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
