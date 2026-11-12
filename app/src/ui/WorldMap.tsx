import { LANG_PLACE, langName } from '../explorer/geo';
import { LAND, LAND_H, LAND_W } from '../explorer/landmask';

const CELL = 6;
const LAND_PATH = (() => {
  let d = '';
  LAND.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '1') d += `M${x * CELL + CELL / 2} ${y * CELL + CELL / 2}h0`; });
  return d;
})();

/** A dotted world map with a bubble per interface language of the players. The map is by language: Telegram tells a bot nothing else about where anyone is. */
export function WorldMap({ langs }: { langs: [string, number][] }) {
  const max = Math.max(1, ...langs.map(([, n]) => n));
  const W = LAND_W * CELL, H = LAND_H * CELL;
  const pts = langs.map(([code, n]) => {
    const p = LANG_PLACE[code.split('-')[0]];
    return p ? { code, n, x: ((p[0] + 180) / 360) * W, y: ((84 - p[1]) / 144) * H, r: 5 + Math.sqrt(n / max) * 16 } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the languages of EGG players">
      <path d={LAND_PATH} className="land" />
      {pts.map((p) => (
        <g key={p.code}>
          <circle cx={p.x} cy={p.y} r={p.r} className="halo" />
          <circle cx={p.x} cy={p.y} r={Math.max(3, p.r * 0.45)} className="dotc"><title>{`${langName(p.code)}: ${p.n}`}</title></circle>
        </g>
      ))}
    </svg>
  );
}
