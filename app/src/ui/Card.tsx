import { ReactNode, useEffect, useRef, useState } from 'react';
import { formatUnits, shortAddr } from '../lib/format';
import { Egg, TonMark } from './Egg';
import { Copy } from './Icons';

const QrIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4" />
  </svg>
);

/** "12 480.5" → big "12 480" + small ".5" like Telegram's card. */
export function Balance({ value, decimals, maxFrac = 2, unit }: { value: bigint; decimals: number; maxFrac?: number; unit: string }) {
  const [whole, frac] = formatUnits(value, decimals, maxFrac).split('.');
  return (
    <div className="bal num">
      {whole}
      {frac && <span className="frac">.{frac}</span>}
      <span className="unit">{unit}</span>
    </div>
  );
}

export function EggCard({
  balance, decimals, address, ready, onQr, onCopy, loading,
}: {
  balance: bigint; decimals: number; address: string; ready: bigint; onQr: () => void; onCopy: () => void; loading?: boolean;
}) {
  return (
    <div className="wcard egg">
      <div className="cur">EGG</div>
      {loading ? <div className="skeleton" style={{ height: 54, width: 170, marginTop: 8, opacity: 0.4 }} /> : <Balance value={balance} decimals={decimals} unit="EGG" />}
      {ready > 0n && (
        <div className="ready-chip num"><i /> {formatUnits(ready, decimals, 2)} ready to hatch</div>
      )}
      <button className="addr-line" onClick={onCopy} aria-label="Copy address"><span className="num">{shortAddr(address, 5, 5)}</span><Copy width={14} height={14} /></button>
      <button className="qr-btn" onClick={onQr} aria-label="Show QR"><QrIcon /></button>
      <div className="art"><Egg size={118} state={ready > 0n ? 'cracking' : 'idle'} /></div>
    </div>
  );
}

export function TonCard({ balance, address, onQr, onCopy }: { balance: bigint; address: string; onQr: () => void; onCopy: () => void }) {
  return (
    <div className="wcard ton">
      <div className="cur"><TonMark /> TON · pays network fees</div>
      <Balance value={balance} decimals={9} maxFrac={3} unit="TON" />
      <button className="addr-line" onClick={onCopy} aria-label="Copy address"><span className="num">{shortAddr(address, 5, 5)}</span><Copy width={14} height={14} /></button>
      <button className="qr-btn" onClick={onQr} aria-label="Show QR"><QrIcon /></button>
    </div>
  );
}

/** Horizontally swipeable cards with page dots. */
export function Pager({ children }: { children: ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setI(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  return (
    <>
      <div className="pager" ref={ref}>{children}</div>
      <div className="pager-dots">{children.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
    </>
  );
}
