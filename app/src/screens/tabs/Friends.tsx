import { useEffect, useState } from 'react';
import { api, FriendsReply } from '../../api/server';
import { cfg } from '../../config';
import { formatUnits } from '../../lib/format';
import { levelOf } from '../../lib/level';
import { haptic, shareLink } from '../../lib/tg';
import { Avatar, copyText, Hero, Pips } from '../../ui/bits';
import { EggMini } from '../../ui/EggMini';
import { useToast } from '../../ui/toast';

const egg = (u: string, f = 2) => formatUnits(BigInt(u || '0'), cfg.token.decimals, f);

/** Friends: everyone you invited, how many eggs each holds, and how many they earned for you. */
export function FriendsPage() {
  const toast = useToast();
  const [s, setS] = useState<FriendsReply | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { void api.friends({}).then(setS).catch(() => setErr(true)); }, []);
  const invite = () => s && shareLink(s.link, 'Hatch eggs with me: every egg we trade is +1 EGG for both of us 🥚');
  return (
    <div className="tab-body">
      <Hero icon={<span className="duo-eggs"><EggMini size={58} wobble /><EggMini size={48} tone="gold" wobble /></span>} title="Friends" sub="Invite friends: each egg they send and hatch earns you EGG too." />
      {err && <p className="hint center">Friends are available inside Telegram.</p>}
      {s && (
        <>
          <section className="card friends-sum">
            <div className="fs"><b>{s.count}</b><span>friends</span></div>
            <div className="fs"><b>{egg(s.earnedFromFriends)}</b><span>EGG they earned you</span></div>
            <div className="fs"><b><Pips n={s.rack.level} max={5} /></b><span>Egg rack</span></div>
          </section>
          <div className="stack" style={{ margin: '12px 0 6px' }}>
            <button className="bigbtn" onClick={invite}>Invite friends</button>
            <button className="bigbtn soft" onClick={() => { copyText(s.link); haptic.success(); toast('Invite link copied'); }}>Copy my link</button>
          </div>
          {s.invitedBy && <p className="hint center" style={{ margin: '10px 0 0' }}>You joined through {s.invitedBy.name} 🐣</p>}

          <h2 className="sec">Top friends</h2>
          {s.friends.length === 0 ? (
            <div className="card empty-state"><EggMini size={56} wobble /><b>No friends yet</b><span>Send an egg to a friend. The first egg they hatch makes you their inviter, and you earn +1 EGG every time an egg of theirs gets hatched.</span></div>
          ) : (
            <div className="card list">
              {s.friends.map((f) => {
                const lv = levelOf(BigInt(f.eggs));
                return (
                  <div key={f.id} className="frow">
                    <span className="rk">{['🥇', '🥈', '🥉'][f.rank - 1] ?? f.rank}</span>
                    <Avatar name={f.name} id={f.id} />
                    <div className="f-main"><b>{f.name}</b><span>{lv.cur.icon} {lv.cur.name}{f.username ? ` · @${f.username}` : ''}</span></div>
                    <div className="f-right"><b>{egg(f.eggs, 1)} <EggMini size={13} /></b><span className={BigInt(f.forMe) > 0n ? 'plus' : ''}>{BigInt(f.forMe) > 0n ? `+${egg(f.forMe)} for you` : 'no bonus yet'}</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
