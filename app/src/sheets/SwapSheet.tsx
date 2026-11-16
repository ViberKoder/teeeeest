import { useMemo, useState } from 'react';
import { openExternal, haptic } from '../lib/tg';
import { formatUnits, parseUnits } from '../lib/format';
import { useWallet } from '../state/wallet';
import { EggCoin } from '../ui/EggCoin';
import { GramCoin } from '../ui/Gram';
import { MainButton } from '../ui/native';
import { Sheet } from '../ui/Sheet';

type Side = 'EGG' | 'Gram';
const Coin = ({ a, size = 36 }: { a: Side; size?: number }) => (a === 'EGG' ? <EggCoin size={size} /> : <GramCoin size={size} />);

/** Swap between EGG and Gram. The trade itself happens on STON.fi (the app opens it with the pair and the amount filled in). */
export function SwapSheet({ onClose }: { onClose: () => void }) {
  const { data, masterAddress } = useWallet();
  const [pay, setPay] = useState<Side>('Gram');
  const [amount, setAmount] = useState('');
  const receive: Side = pay === 'EGG' ? 'Gram' : 'EGG';
  const have = pay === 'EGG' ? (data.egg?.balance ?? 0n) + data.ready : data.ton;
  const units = useMemo(() => (amount ? parseUnits(amount, 9) : null), [amount]);
  const over = Boolean(units && units > have);
  const ok = Boolean(masterAddress && units && units > 0n && !over);
  const flip = () => { haptic.select(); setPay(receive); setAmount(''); };
  const go = () => {
    if (!masterAddress || !units) return;
    const m = masterAddress.toString();
    const q = pay === 'Gram' ? `ft=TON&tt=${m}` : `ft=${m}&tt=TON`;
    openExternal(`https://app.ston.fi/swap?${q}&fa=${amount}`);
  };
  return (
    <Sheet onClose={onClose} title="Swap" footer={<MainButton inline text={!masterAddress ? 'EGG is not listed yet' : over ? 'Insufficient funds' : ok ? `Swap ${pay} to ${receive}` : 'Enter an amount'} enabled={ok} onClick={go} />}>
      <div className="swap-stack">
        <div className="swap-card">
          <div className="swap-top"><span>You pay</span><button onClick={() => setAmount(formatUnits(have, 9, 9).replace(/\s/g, ''))}>Max {formatUnits(have, 9, 3)}</button></div>
          <div className="swap-row">
            <span className="swap-coin"><Coin a={pay} />{pay}</span>
            <input className="swap-in num" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
          </div>
        </div>
        <button className="swap-flip" onClick={flip} aria-label="Swap direction">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4v15M8 19l-3.5-3.5M8 19l3.5-3.5M16 20V5M16 5l-3.5 3.5M16 5l3.5 3.5" /></svg>
        </button>
        <div className="swap-card">
          <div className="swap-top"><span>You receive</span><span className="muted">best price</span></div>
          <div className="swap-row">
            <span className="swap-coin"><Coin a={receive} />{receive}</span>
            <span className="swap-out num">—</span>
          </div>
        </div>
      </div>
      <div className="card list-card" style={{ marginTop: 14 }}>
        <div className="kv"><span>Route</span><b>STON.fi</b></div>
        <div className="kv"><span>Price</span><b>Shown before you confirm</b></div>
        <div className="kv"><span>Network fee</span><b>≈ 0.3 Gram</b></div>
      </div>
      <p className="foot-note">The swap is made on STON.fi with your wallet. Check the price there before you confirm.</p>
    </Sheet>
  );
}
