import { useEffect, useState } from 'react';
import { api } from '../api/server';
import { langName } from '../explorer/geo';
import { Page, Row, Section } from '../ui/native';
import { WorldMap } from '../ui/WorldMap';

/** Where the eggs travel: players by the language of their Telegram (the only place hint a bot gets). */
export function MapPage({ onClose }: { onClose: () => void }) {
  const [langs, setLangs] = useState<[string, number][] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { void api.stats(false).then((r) => setLangs(r.langs ?? [])).catch(() => setErr(true)); }, []);
  const total = (langs ?? []).reduce((a, [, n]) => a + n, 0);
  return (
    <Page title="Egg map" onBack={onClose}>
      <p className="hint center" style={{ padding: '2px 24px 10px', fontSize: 15 }}>Where the eggs travel: players by the language of their Telegram.</p>
      <div className="map-card">{langs && <WorldMap langs={langs} />}{err && <p className="hint center">The map is available inside Telegram.</p>}</div>
      <Section title={langs ? `${total.toLocaleString('en')} players with a known language` : 'Languages'}>
        {(langs ?? []).slice(0, 12).map(([code, n], i) => (
          <Row key={code} icon={<span className="row-icon icon-soft"><span>{i + 1}</span></span>} title={langName(code)} subtitle={code} trailing={<span className="num">{n.toLocaleString('en')} · {Math.round((n / Math.max(1, total)) * 100)}%</span>} />
        ))}
        {langs && langs.length === 0 && <Row title="No data yet" subtitle="The map fills as players open the bot" />}
      </Section>
    </Page>
  );
}
