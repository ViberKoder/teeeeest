import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Address } from '@ton/core';

import { Screen, Card, Button, Field, RmjBadge } from '../ui/components';
import { addWatchedJetton, loadVault, removeWatchedJetton } from '../state/vault';
import { getJettonInfo, type JettonMasterInfo } from '../services/ton';
import { haptic } from '../services/tma';

const DEFAULT_MASTER = (import.meta.env.VITE_DEFAULT_RMJ_MASTER as string | undefined) ?? '';

export function AddJetton() {
  const nav = useNavigate();
  const vault = loadVault();
  const [input, setInput] = useState(DEFAULT_MASTER);
  const [info, setInfo] = useState<JettonMasterInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const watched = vault?.watchedJettons ?? [];
  const network = vault?.account.network ?? 'mainnet';

  async function lookup() {
    setErr('');
    setInfo(null);
    setBusy(true);
    try {
      const master = Address.parse(input.trim()).toRawString();
      const i = await getJettonInfo(network, master);
      setInfo(i);
    } catch (e: any) {
      setErr(e?.message ?? 'Lookup failed');
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!info) return;
    addWatchedJetton(info.address);
    haptic('success');
    nav('/home');
  }

  function unwatch(master: string) {
    removeWatchedJetton(master);
    haptic('light');
    setInfo(null);
  }

  return (
    <Screen back="/home">
      <h1 className="title">Add jetton</h1>
      <p className="subtitle">
        Paste a jetton master address (EQ… / UQ… / 0:…). RMJ tokens will display your off-chain
        pending balance even before your jetton-wallet is deployed on-chain.
      </p>

      <Card>
        <Field label="Jetton master address">
          <input
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="EQ…"
          />
        </Field>
        {err && <div className="error-text">{err}</div>}
        <Button full disabled={busy || !input.trim()} onClick={() => void lookup()}>
          {busy ? 'Looking up…' : 'Lookup'}
        </Button>
      </Card>

      {info && (
        <Card>
          <div className="row">
            <div className="icon" style={{ width: 48, height: 48 }}>
              {info.image ? <img src={info.image} alt="" /> : <span>{(info.symbol ?? '?').slice(0, 1)}</span>}
            </div>
            <div className="meta">
              <div className="name">{info.name ?? 'Jetton'} {info.customPayloadApiUri && <RmjBadge />}</div>
              <div className="sub">{info.symbol} • {info.decimals} decimals</div>
            </div>
          </div>
          {info.customPayloadApiUri && (
            <div className="muted" style={{ fontSize: 12 }}>
              custom_payload_api_uri detected — pending balances will be fetched from this server and
              the claim will piggy-back on your first transfer.
            </div>
          )}
          <Button full onClick={add}>Add to wallet</Button>
        </Card>
      )}

      {watched.length > 0 && (
        <>
          <div className="section-title">Watched jettons</div>
          <div className="list">
            {watched.map((m) => (
              <div key={m} className="row-item">
                <div className="meta">
                  <div className="name">Jetton master</div>
                  <div className="sub code">{m}</div>
                </div>
                <button onClick={() => unwatch(m)} className="btn ghost" style={{ padding: '8px 12px' }}>Remove</button>
              </div>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
