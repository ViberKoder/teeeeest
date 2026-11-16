import { useEffect, useState } from 'react';
import { api, StatsReply } from '../api/server';
import { cfg } from '../config';
import { langName } from '../explorer/geo';
import { formatUnits } from '../lib/format';
import { Bar, Hero } from '../ui/bits';
import { EggMini } from '../ui/EggMini';
import { WorldMap } from '../ui/WorldMap';

const KIND: Record<string, string> = { post: '🥚', inline: '🐣', sender: '📨', ref: '🤝', task: '⭐', battle: '🏆', legacy: '🥚' };
const ago = (t: number) => { const s = Math.max(0, Math.floor(Date.now() / 1000) - t); return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };

/** The world: where the eggs travel (by the language of players' Telegram) and what is hatching right now. */
export function WorldPage() {
  const [r, setR] = useState<StatsReply | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const go = () => { void api.stats(false).then(setR).catch(() => setErr(true)); };
    go();
    const t = setInterval(go, 6000);
    return () => clearInterval(t);
  }, []);
  const langs = r?.langs ?? [];
  const total = langs.reduce((a, [, n]) => a + n, 0);
  const top = Math.max(1, ...langs.map(([, n]) => n));
  return (
    <div className="tab-body">
      <Hero icon={<span className="big-emoji">🌍</span>} title="World" sub="Where the eggs travel: players by the language of their Telegram." />
      {err && <p className="hint center">The map is available inside Telegram.</p>}
      <section className="card mapcard">
        <WorldMap langs={langs} />
        {r && <div className="map-stats"><div><b>{(r.stats.users ?? 0).toLocaleString('en')}</b><span>players</span></div><div><b>{langs.length}</b><span>languages</span></div><div><b>{(r.stats.events ?? 0).toLocaleString('en')}</b><span>eggs hatched</span></div></div>}
      </section>
      <h2 className="sec">Languages</h2>
      <div className="card list">
        {langs.slice(0, 8).map(([code, n], i) => (
          <div key={code} className="lrow"><span className="rk">{i + 1}</span><div className="l-main"><b>{langName(code)}</b><Bar value={n / top} /></div><span className="num">{n.toLocaleString('en')} · {Math.round((n / Math.max(1, total)) * 100)}%</span></div>
        ))}
        {r && langs.length === 0 && <div className="empty-state"><EggMini size={52} wobble /><b>The map is warming up</b><span>It fills as players open the bot.</span></div>}
      </div>
      <h2 className="sec">Hatching now <em className="live"><i />live</em></h2>
      <div className="card list">
        {(r?.recent ?? []).slice(0, 8).map((e, i) => (
          <div key={`${e.t}-${i}`} className="lrow ev"><span className="ev-ic">{KIND[e.kind] ?? '🥚'}</span><div className="l-main"><b>+{formatUnits(BigInt(e.amount), cfg.token.decimals, 2)} EGG</b></div><span className="hint">{ago(e.t)}</span></div>
        ))}
      </div>
    </div>
  );
}
