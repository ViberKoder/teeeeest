import { useEffect, useState } from 'react';
import { FRAMES } from '../lib/sticker';
import { Sticker } from './Sticker';

/**
 * The launch screen: the egghatch sticker plays — egg, cracks, chick — while the wallet opens behind it.
 * It lasts as long as the animation (or a short cap) and never blocks: tap to skip.
 */
export function Splash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const [played, setPlayed] = useState(false);
  const [out, setOut] = useState(false);

  useEffect(() => {
    const cap = setTimeout(() => setPlayed(true), 3200);
    return () => clearTimeout(cap);
  }, []);

  const go = ready && played;
  useEffect(() => {
    if (!go) return;
    setOut(true);
    const t = setTimeout(onFinish, 420);
    return () => clearTimeout(t);
  }, [go, onFinish]);

  return (
    <div className={`splash ${out ? 'out' : ''}`} onClick={() => setPlayed(true)} role="presentation">
      <div className="bg" />
      <div className="col">
        <Sticker mode={{ kind: 'play', from: FRAMES.egg, to: FRAMES.hatched + 8, speed: 1.15 }} size={240} onDone={() => setPlayed(true)} />
        <h2>EGG Wallet</h2>
        <p>{ready ? 'Ready' : 'Opening your wallet…'}</p>
      </div>
    </div>
  );
}
