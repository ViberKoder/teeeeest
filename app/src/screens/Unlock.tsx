import { useEffect, useState } from 'react';
import { attempts } from '../crypto/vault';
import { shortAddr } from '../lib/format';
import { useWallet } from '../state/wallet';
import { Egg } from '../ui/Egg';
import { PinPad } from '../ui/PinPad';

export function Unlock() {
  const w = useWallet();
  const [shake, setShake] = useState(0);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tick = () => setWait(Math.max(0, Math.ceil((attempts.state().until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [shake]);

  const submit = async (pin: string) => {
    setBusy(true);
    const r = await w.unlock(pin);
    setBusy(false);
    if (r !== 'ok') setShake((s) => s + 1);
  };

  return (
    <div className="screen">
      <div className="stack center" style={{ alignItems: 'center', marginTop: 28, gap: 8 }}>
        <Egg size={76} float />
        <h2 style={{ margin: '6px 0 0', fontSize: 22 }}>Enter passcode</h2>
        <p className="hint num">{w.lockedAddress ? shortAddr(w.lockedAddress, 5, 5) : ''}</p>
      </div>
      <div className="grow" />
      {wait > 0 ? (
        <p className="center hint bad" style={{ marginBottom: 24 }}>Too many attempts. Try again in {wait}s.</p>
      ) : busy ? (
        <div className="center"><span className="spinner" style={{ width: 28, height: 28 }} /></div>
      ) : (
        <PinPad onComplete={submit} shake={shake} />
      )}
      <div style={{ height: 24 }} />
    </div>
  );
}
