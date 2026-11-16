import { useId } from 'react';
import { LANG_PLACE, langName } from '../explorer/geo';
import { LAND, LAND_H, LAND_W } from '../explorer/landmask';

const CELL = 6;
const LAND_PATH = (() => {
  let d = '';
  LAND.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '1') d += `M${x * CELL + CELL / 2} ${y * CELL + CELL / 2}h0`; });
  return d;
})();
const EGG = 'M0-1.25C.85-1.25 1.3 0 1.3.55C1.3 1.15.72 1.5 0 1.5C-.72 1.5-1.3 1.15-1.3.55C-1.3 0-.85-1.25 0-1.25Z';

/** A dotted world map with an egg for every language community of the players (Telegram tells a bot nothing finer than the interface language). */
export function WorldMap({ langs, active, onPick }: { langs: [string, number][]; active?: string | null; onPick?: (code: string) => void }) {
  const id = useId().replace(/:/g, '');
  const max = Math.max(1, ...langs.map(([, n]) => n));
  const W = LAND_W * CELL, H = LAND_H * CELL;
  const pts = langs.map(([code, n]) => {
    const p = LANG_PLACE[code.split('-')[0]];
    return p ? { code, n, x: ((p[0] + 180) / 360) * W, y: ((84 - p[1]) / 144) * H, r: 11 + Math.sqrt(n / max) * 26 } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => b.n - a.n);
  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the languages of EGG players">
      <defs>
        <radialGradient id={`e${id}`} cx="36%" cy="26%" r="90%"><stop offset="0" stopColor="#fffdf8" /><stop offset=".55" stopColor="#f6e3b0" /><stop offset="1" stopColor="#e3a93e" /></radialGradient>
        <radialGradient id={`g${id}`}><stop offset="0" stopColor="#ffe08a" stopOpacity=".75" /><stop offset="1" stopColor="#ffe08a" stopOpacity="0" /></radialGradient>
      </defs>
      <path d={LAND_PATH} className="land" />
      {pts.map((p) => (
        <g key={p.code} className={`mk ${active === p.code ? 'on' : ''}`} transform={`translate(${p.x} ${p.y})`} onClick={() => onPick?.(p.code)} style={{ cursor: onPick ? 'pointer' : undefined }}>
          <circle r={p.r * 1.9} fill={`url(#g${id})`} className="mk-glow" />
          <g transform={`scale(${p.r / 1.5})`}>
            <path d={EGG} fill={`url(#e${id})`} stroke="#b9791f" strokeWidth=".09" />
            <ellipse cx="-.42" cy="-.5" rx=".22" ry=".38" fill="#fff" opacity=".85" transform="rotate(18 -.42 -.5)" />
          </g>
          <title>{`${langName(p.code)}: ${p.n}`}</title>
        </g>
      ))}
    </svg>
  );
}
