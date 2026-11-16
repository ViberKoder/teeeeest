import { useState } from 'react';
import { api, StatsReply } from '../api/server';
import { langName } from '../explorer/geo';
import { units } from '../lib/format';
import { compact } from '../lib/league';
import { timeAgo } from '../lib/format';
import { useApi } from '../lib/useApi';
import { EggCoin } from '../ui/EggCoin';
import { Page } from '../ui/native';
import { WorldMap } from '../ui/WorldMap';

const FEED: Record<string, { text: string; tone: 'cream' | 'gold' | 'mint' }> = {
  post: { text: 'hatched an egg under a post', tone: 'cream' },
  inline: { text: 'hatched a friend’s egg', tone: 'cream' },
  widget: { text: 'hatched an egg', tone: 'cream' },
  sender: { text: 'had an egg hatched', tone: 'mint' },
  ref: { text: 'got a friend bonus', tone: 'mint' },
  battle: { text: 'won a battle prize', tone: 'gold' },
  daily: { text: 'checked in for the day', tone: 'gold' },
  task: { text: 'finished a task', tone: 'gold' },
};

/** The egg map: where the eggs travel (players by the language of their Telegram), what is hatching right now, and the numbers behind it. */
export function MapPage({ onClose }: { onClose: () => void }) {
  const { data, error } = useApi<StatsReply>(() => api.stats(false), []);
  const [pick, setPick] = useState<string | null>(null);
  const langs = data?.langs ?? [];
  const total = langs.reduce((a, [, n]) => a + n, 0);
  const sel = pick ? langs.find(([c]) => c === pick) : null;
  const s = data?.stats;

  return (
    <Page title="Egg map" onBack={onClose}>
      <section className="map-hero">
        <div className="map-glow" />
        {data ? <WorldMap langs={langs} active={pick} onPick={(c) => setPick(pick === c ? null : c)} /> : <div className="skeleton" style={{ height: 190, borderRadius: 18 }} />}
        {error && !data && <p className="hint center" style={{ padding: 20 }}>The map opens inside Telegram.</p>}
        <div className="map-chip">
          {sel ? <><b>{langName(sel[0])}</b><span className="num">{sel[1].toLocaleString('en')} players · {Math.round((sel[1] / Math.max(1, total)) * 100)}%</span></>
            : <><b className="num">{total.toLocaleString('en')}</b><span>players, {langs.length} languages</span></>}
        </div>
      </section>

      {s && (
        <div className="stat-grid">
          <div className="stat"><small>Players</small><b className="num">{compact(s.users)}</b></div>
          <div className="stat"><small>Hatching now</small><b className="num">{s.hatchesLastHour}<em>/h</em></b></div>
          <div className="stat"><small>EGG earned</small><b className="num"><EggCoin size={17} />{compact(Number(units(s.promised, 9, 0).replace(/\s/g, '')))}</b></div>
          <div className="stat"><small>Today</small><b className="num"><EggCoin size={17} tone="gold" />{compact(Number(units(s.today, 9, 0).replace(/\s/g, '')))}</b></div>
        </div>
      )}

      <div className="sec-row"><h3>Hatching right now</h3><span className="live"><i />live</span></div>
      <div className="card feed-card">
        {(data?.recent ?? []).slice(0, 8).map((e, i) => {
          const f = FEED[e.kind] ?? { text: 'hatched an egg', tone: 'cream' as const };
          return (
            <div key={i} className="feed">
              <EggCoin size={36} tone={f.tone} spark={f.tone === 'gold'} />
              <span className="feed-main"><b>Player {e.who}</b><small>{f.text} · {timeAgo(e.t)}</small></span>
              <span className="feed-amt num">+{units(e.amount, 9, 2)}</span>
            </div>
          );
        })}
        {data && data.recent.length === 0 && <div className="empty-mini">Quiet for now. The first egg of the day is yours.</div>}
        {!data && !error && <div className="empty-mini">Loading…</div>}
      </div>

      <div className="sec-row"><h3>Where players are</h3><span className="muted">by Telegram language</span></div>
      <div className="card region-card">
        {langs.slice(0, 10).map(([code, n], i) => (
          <button key={code} className={`region ${pick === code ? 'on' : ''}`} onClick={() => setPick(pick === code ? null : code)}>
            <span className="region-n num">{i + 1}</span>
            <span className="region-main"><b>{langName(code)}</b><span className="pbar"><i style={{ width: `${(n / Math.max(1, langs[0]?.[1] ?? 1)) * 100}%` }} /></span></span>
            <span className="region-v num">{n.toLocaleString('en')}</span>
          </button>
        ))}
        {data && langs.length === 0 && <div className="empty-mini">The map fills as players open the bot</div>}
      </div>
    </Page>
  );
}
