import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Screen, Card, Button, Field } from '../ui/components';
import { keyring } from '../state/keyring';
import { deleteVault, loadVault } from '../state/vault';
import { haptic } from '../services/tma';

export function Unlock() {
  const nav = useNavigate();
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const vault = loadVault();

  async function unlock() {
    setErr('');
    setBusy(true);
    try {
      await keyring.unlock(passcode);
      setPasscode('');
      haptic('success');
      nav('/home', { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? 'Unlock failed');
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (!confirm('Erase this wallet from this device? You will need the 24-word phrase to restore it.')) return;
    deleteVault();
    keyring.lock();
    nav('/', { replace: true });
  }

  return (
    <Screen>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        <h1 className="title" style={{ textAlign: 'center' }}>Enter passcode</h1>
        <p className="subtitle" style={{ textAlign: 'center' }}>
          {vault?.account.address.slice(0, 4)}…{vault?.account.address.slice(-4)}
        </p>
        <Card>
          <Field label="Passcode">
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              className="input"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void unlock();
              }}
            />
          </Field>
          {err && <div className="error-text">{err}</div>}
          <Button full disabled={busy} onClick={() => void unlock()}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
        </Card>
        <button
          onClick={reset}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 13,
            marginTop: 16,
          }}
        >
          Forgot passcode? Erase wallet
        </button>
      </div>
    </Screen>
  );
}
