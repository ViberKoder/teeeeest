import { useEffect, useState } from 'react';
import { haptic } from '../lib/tg';
import { Backspace } from './Icons';

export const PIN_LENGTH = 6;

export function PinPad({
  onComplete,
  shake,
  disabled,
}: {
  onComplete: (pin: string) => void;
  shake?: number;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (shake) setPin('');
  }, [shake]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      const p = pin;
      const t = setTimeout(() => {
        onComplete(p);
        setPin('');
      }, 120);
      return () => clearTimeout(t);
    }
  }, [pin, onComplete]);

  const press = (d: string) => {
    if (disabled || pin.length >= PIN_LENGTH) return;
    haptic.select();
    setPin((p) => p + d);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div>
      <div className={`dots ${shake ? 'shake' : ''}`} key={shake}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>{d}</button>
        ))}
        <span className="key blank" />
        <button className="key" onClick={() => press('0')}>0</button>
        <button className="key fn" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))}><Backspace /></button>
      </div>
    </div>
  );
}
