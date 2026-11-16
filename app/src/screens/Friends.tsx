import { useMemo } from 'react';
import { api, FriendsReply } from '../api/server';
import { cfg } from '../config';
import { units } from '../lib/format';
import { hueOf, leagueOf } from '../lib/league';
import { haptic, shareLink, tgUserId } from '../lib/tg';
import { useApi } from '../lib/useApi';
import { useWallet } from '../state/wallet';
import { EggCoin } from '../ui/EggCoin';
import { Copy, Users } from '../ui/Icons';
import { useToast } from '../ui/toast';

function Row({ rank, f, me }: { rank: number; f: { name: string; username: string | null; eggs: string; forMe: string }; me?: boolean }) {
  const lg = leagueOf(BigInt(f.eggs)).cur;
  return (
    <div className={`frow ${me ? 'me' : ''}`}>
      <span className={`rank num ${rank <= 3 ? `m${rank}` : ''}`}>{rank}</span>
      <span className="avatar lg" style={{ ['--h' as string]: hueOf(f.name) }}>{me ? '★' : (f.name[0] ?? '#').toUpperCase()}</span>
      <span className="frow-main">
        <b>{me ? 'You' : f.name}</b>
        <small>{lg.name}{f.username && !me ? ` · @${f.username}` : ''}</small>
      </span>
      <span className="frow-side">
        <b className="num"><EggCoin size={15} />{units(f.eggs, 9, 0)}</b>
        {!me && BigInt(f.forMe) > 0n && <small className="num good">+{units(f.forMe, 9, 2)} to you</small>}
      </span>
    </div>
  );
}

export function FriendsScreen() {
  const toast = useToast();
  const w = useWallet();
  const { data, error, loading } = useApi<FriendsReply>(() => api.friends(), []);
  const link = data?.link ?? `https://t.me/${cfg.bot}?startapp=ref_${tgUserId()}`;
  const invite = () => { haptic.tap(); shareLink(link, 'Hatch eggs with me and earn EGG 🥚'); };
  const copy = () => { void navigator.clipboard?.writeText(link); haptic.success(); toast('Invite link copied'); };
  const mine = (w.data.egg?.balance ?? 0n) + w.data.ready + w.data.accruing;

  const ranked = useMemo(() => {
    if (!data) return [];
    const all = [...data.friends.map((f) => ({ ...f, me: false })), { name: 'You', username: null, eggs: String(mine), forMe: '0', me: true }];
    return all.sort((a, b) => (BigInt(b.eggs) > BigInt(a.eggs) ? 1 : BigInt(b.eggs) < BigInt(a.eggs) ? -1 : 0));
  }, [data, mine]);
  const flockTotal = data ? data.friends.reduce((a, f) => a + BigInt(f.eggs), 0n) : 0n;

  return (
    <div className="screen-pad friends">
      <header className="page-top"><div><h1>Friends</h1><p>Hatch together, earn together</p></div></header>

      <section className="invite-card">
        <h2>Invite friends</h2>
        <p>You earn a share of every egg your friends hatch, on top of theirs. Friends who play also grow your Egg rack.</p>
        <div className="invite-actions">
          <button className="btn-main" onClick={invite}><Users width={20} height={20} />Invite a friend</button>
          <button className="btn-glass" onClick={copy} aria-label="Copy invite link"><Copy width={20} height={20} /></button>
        </div>
      </section>

      <div className="stat-row">
        <div className="stat"><small>Friends</small><b className="num">{data ? `${data.active}/${data.count}` : '—'}</b></div>
        <div className="stat"><small>You earned</small><b className="num"><EggCoin size={18} />{data ? units(data.earnedFromFriends, 9, 0) : '—'}</b></div>
        <div className="stat"><small>Their eggs</small><b className="num"><EggCoin size={18} />{data ? units(flockTotal, 9, 0) : '—'}</b></div>
      </div>

      <div className="sec-row"><h3>Friends top</h3>{data?.invitedBy && <span className="muted">invited by {data.invitedBy.name}</span>}</div>
      {error && !data ? (
        <div className="empty-card"><EggCoin size={60} float /><b>Friends open inside Telegram</b><span>Open the wallet from the bot to see your flock.</span></div>
      ) : data && data.friends.length === 0 ? (
        <div className="empty-card"><EggCoin size={60} float /><b>No friends yet</b><span>Send your link to a friend. When they hatch their first egg, they show up here.</span><button className="btn-main sm" onClick={invite}>Invite a friend</button></div>
      ) : (
        <div className="card friend-card">
          {ranked.map((f, i) => <Row key={f.me ? 'me' : f.name + i} rank={i + 1} f={f} me={f.me} />)}
          {loading && !data && Array.from({ length: 4 }, (_, i) => <div key={i} className="frow"><span className="skeleton" style={{ width: 44, height: 44, borderRadius: 22 }} /><span className="frow-main"><span className="skeleton" style={{ height: 14, width: '50%' }} /></span></div>)}
        </div>
      )}
    </div>
  );
}
