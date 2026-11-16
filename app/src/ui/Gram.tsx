/** Gram — drawn as a faceted gem, the way Telegram's wallet shows it. Facet shades are layers of one colour, so the mark works on any background. */
export function GramMark({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <g fill={color}>
        <path d="M3 9.2 7 4.2h2.6L8.2 9.2z" opacity=".78" />
        <path d="M9.6 4.2h4.8l1.2 5H8.2z" opacity=".98" />
        <path d="M14.4 4.2H17l4 5h-5.4z" opacity=".82" />
        <path d="M3 9.2h5.2L12 20.6z" opacity=".7" />
        <path d="M8.2 9.2h7.4L12 20.6z" opacity=".92" />
        <path d="M15.6 9.2H21L12 20.6z" opacity=".62" />
      </g>
    </svg>
  );
}

/** The coin: a blue disc with the gem. */
export function GramCoin({ size = 40 }: { size?: number }) {
  return (
    <span className="coin gram-coin" style={{ width: size, height: size }}>
      <GramMark size={Math.round(size * 0.58)} />
    </span>
  );
}
