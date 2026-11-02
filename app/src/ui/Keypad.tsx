import { haptic } from '../lib/tg';
import { Backspace } from './Icons';

/** The amount keypad, like Telegram's Send screen: big digits, no system keyboard. */
export function Keypad({ value, onChange, decimals }: { value: string; onChange: (v: string) => void; decimals: number }) {
  const press = (k: string) => {
    haptic.select();
    if (k === 'back') return onChange(value.slice(0, -1));
    if (k === '.') {
      if (value.includes('.') || decimals === 0) return;
      return onChange(value === '' ? '0.' : value + '.');
    }
    const [, frac = ''] = value.split('.');
    if (value.includes('.') && frac.length >= decimals) return;
    if (value === '0') return onChange(k); // no leading zeros
    if (value.replace('.', '').length >= 15) return;
    onChange(value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  return (
    <div className="keypad">
      {keys.map((k) => (
        <button key={k} className={k === 'back' || k === '.' ? 'fn' : ''} onClick={() => press(k)} aria-label={k === 'back' ? 'Delete' : k}>
          {k === 'back' ? <Backspace width={26} height={26} /> : k}
        </button>
      ))}
    </div>
  );
}
