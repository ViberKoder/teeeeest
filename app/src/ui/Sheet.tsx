import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { inTelegram, tg } from '../lib/tg';
import { Close } from './Icons';

/**
 * Telegram-style bottom sheet: a dimmed backdrop, rounded top corners, a grabber you can pull down, Esc / backdrop / the native
 * BackButton to close. Content scrolls inside; `footer` stays pinned (the primary action of a step).
 */
export function Sheet({ title, onClose, children, footer, tall = false, onBack, left }: { title?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; tall?: boolean; onBack?: () => void; left?: ReactNode }) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onClose);
  cb.current = onClose;
  const back = useRef(onBack);
  back.current = onBack;

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => cb.current(), 200);
  }, []);
  const up = useCallback(() => (back.current ? back.current() : close()), [close]);

  useEffect(() => {
    const native = inTelegram ? tg?.BackButton : undefined;
    if (native) {
      native.show();
      native.onClick(up);
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && up();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (native) { native.offClick(up); native.hide(); }
    };
  }, [up]);

  const onDown = (e: React.PointerEvent) => { start.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current)); };
  const onUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag > 110) close(); else setDrag(0);
  };

  return (
    <div className={`sheet-root ${closing ? 'closing' : ''}`}>
      <div className="sheet-back" onClick={close} />
      <div ref={el} className={`sheet ${tall ? 'tall' : ''}`} role="dialog" aria-modal style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? 'none' : undefined }}>
        <div className="sheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <i className="grabber" />
          <div className="sheet-bar">
            <span className="sheet-l">{left}</span>
            <b className="sheet-title">{title}</b>
            <button className="sheet-x" onClick={close} aria-label="Close"><Close width={16} height={16} /></button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
