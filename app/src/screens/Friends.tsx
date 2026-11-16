import { useMemo } from 'react';
import { api, Friend, FriendsReply } from '../api/server';
import { cfg } from '../config';
import { units } from '../lib/format';
import { hueOf, initialOf, leagueOf, playerName } from '../lib/league';
import { haptic, shareLink, tgUserId } from '../lib/tg';
import { useApi } from '../lib/useApi';
import { Chick } from '../ui/Chick';
import { EggCoin } from '../ui/EggCoin';
import { Copy, Users } from '../ui/Icons';
import { useToast } from '../ui/toast';

function Row({ rank, f, me, pct }: { rank: number; f: Friend & { me?: boolean }; me?: boolean; pct: number }) {
  const lg = leagueOf(BigInt(f.balance)).cur;
  return (
    <div className={`frow ${me ? 'me' : ''}`}>
      <span className={`rank num ${rank <= 3 ? `m${rank}` : ''}`}>{rank}</span>
      <span className="avatar lg" style={{ ['--h' as string]: hueOf(f.username ?? f.tag) }}>{me ? '★' : initialOf(f)}</span>
      <span className="frow-main">
        <b>{me ? 'You' : playerName(f)}</b>
        <small><span className="lg-chip" style={{ background: `linear-gradient(135deg, ${lg.from}, ${lg.to})` }}>{lg.emoji}</span>{lg.name}{f.squad ? ' · in a squad' : ''}</small>
      </span>
      <span className="frow-side">
        <b className="num"><EggCoin size={15} />{units(f.balance, 9, 0)}</b>
        {!me && BigInt(f.gave) > 0n && <small className="num good">+{units(f.gave, 9, 2)} to you</small>}
        {!me && BigInt(f.gave) === 0n && pct > 0 && <small>{pct}% to you</small>}
      </span>
    </div>
  );
}

export function FriendsScreen() {
  const toast = useToast();
  const { data, error, loading } = useApi<FriendsReply>(() => api.friends(), []);
  const link = `https://t.me/${cfg.bot}?start=ref_${tgUserId()}`;
  const pct = data?.pct || 25;
  const invite = () => { haptic.tap(); shareLink(link, 'Hatch eggs with me and earn EGG 🥚'); };
  const copy = () => { void navigator.clipboard?.writeText(link); haptic.success(); toast('Invite link copied'); };

  const ranked = useMemo(() => {
    if (!data) return [];
    const all: (Friend & { me?: boolean })[] = [...data.friends, { tag: '', username: null, balance: data.balance, gave: '0', joined: 0, last: 0, squad: false, me: true }];
    return all.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : BigInt(b.balance) < BigInt(a.balance) ? -1 : 0));
  }, [data]);
  const flockTotal = data ? data.friends.reduce((a, f) => a + BigInt(f.balance), 0n) : 0n;

  return (
    <div className="screen-pad friends">
      <header className="page-top"><div><h1>Friends</h1><p>Hatch together, earn together</p></div></header>

      <section className="invite-card">
        <div className="flock"><Chick size={78} wave /><Chick size={104} hatching /><Chick size={78} /></div>
        <h2>Invite friends,<br />earn {pct}% of their eggs</h2>
        <p>Every egg a friend hatches pays you {pct}% on top. It never reduces theirs, and it never runs out.</p>
        <div className="invite-actions">
          <button className="btn-main" onClick={invite}><Users width={20} height={20} />Invite a friend</button>
          <button className="btn-glass" onClick={copy} aria-label="Copy invite link"><Copy width={20} height={20} /></button>
        </div>
      </section>

      <div className="stat-row">
        <div className="stat"><small>Friends</small><b className="num">{data ? data.count : '—'}</b></div>
        <div className="stat"><small>You earned</small><b className="num"><EggCoin size={18} />{data ? units(data.earned, 9, 0) : '—'}</b></div>
        <div className="stat"><small>Their eggs</small><b className="num"><EggCoin size={18} />{data ? units(flockTotal, 9, 0) : '—'}</b></div>
      </div>

      <div className="sec-row"><h3>Friends top</h3>{data && data.invitedBy && <span className="muted">invited by @{data.invitedBy}</span>}</div>
      {error && !data ? (
        <div className="empty-card"><Chick size={84} wave /><b>Friends open inside Telegram</b><span>Open the wallet from the bot to see your flock.</span></div>
      ) : data && data.friends.length === 0 ? (
        <div className="empty-card"><Chick size={90} hatching /><b>No friends yet</b><span>Send your link to a friend. When they hatch their first egg, they show up here and you start earning {pct}% of everything they hatch.</span><button className="btn-main sm" onClick={invite}>Invite a friend</button></div>
      ) : (
        <div className="card friend-card">
          {ranked.map((f, i) => <Row key={f.me ? 'me' : f.tag} rank={i + 1} f={f} me={f.me} pct={pct} />)}
          {loading && !data && Array.from({ length: 4 }, (_, i) => <div key={i} className="frow"><span className="skeleton" style={{ width: 44, height: 44, borderRadius: 22 }} /><span className="frow-main"><span className="skeleton" style={{ height: 14, width: '50%' }} /></span></div>)}
        </div>
      )}
    </div>
  );
}
