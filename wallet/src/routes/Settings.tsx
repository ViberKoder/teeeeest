import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Screen, Card, Button, Field, Toast, useToast } from '../ui/components';
import { deleteVault, loadVault, saveVault } from '../state/vault';
import { keyring } from '../state/keyring';
import { decryptSeed, changePasscode } from '../crypto/passcode';
import { copyToClipboard, haptic } from '../services/tma';

const APP_VERSION = '0.1.0';

export function Settings() {
  const nav = useNavigate();
  const vault = loadVault();
  const [section, setSection] = useState<'main' | 'export' | 'passcode'>('main');

  if (!vault) {
    nav('/', { replace: true });
    return null;
  }

  function lock() {
    keyring.lock();
    nav('/unlock', { replace: true });
  }

  function eraseWallet() {
    if (!confirm('Erase wallet from this device? You will need your 24-word recovery phrase to restore it.')) return;
    deleteVault();
    keyring.lock();
    nav('/', { replace: true });
  }

  if (section === 'export') {
    return <ExportSeedScreen onBack={() => setSection('main')} />;
  }
  if (section === 'passcode') {
    return <ChangePasscodeScreen onBack={() => setSection('main')} />;
  }

  return (
    <Screen back="/home">
      <h1 className="title">Settings</h1>
      <Card>
        <div className="muted" style={{ fontSize: 13 }}>Account</div>
        <div style={{ fontWeight: 600 }}>{vault.account.name}</div>
        <div className="code">{vault.account.address}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Wallet {vault.account.walletVersion} · {vault.account.network}
        </div>
      </Card>
      <Card>
        <Button variant="secondary" onClick={() => setSection('passcode')}>Change passcode</Button>
        <Button variant="secondary" onClick={() => setSection('export')}>Export raw seed (advanced)</Button>
        <Button variant="secondary" onClick={lock}>Lock wallet</Button>
        <Button variant="danger" onClick={eraseWallet}>Erase wallet</Button>
      </Card>
      <div className="muted" style={{ fontSize: 12, padding: '0 4px' }}>
        Your 24-word recovery phrase is the canonical backup. It is shown <strong>only once</strong>
        at wallet creation and is not stored anywhere on this device. If you missed the backup, erase
        this wallet, create a new one, and write the phrase down this time.
      </div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12 }}>RMJ Wallet v{APP_VERSION}</div>
    </Screen>
  );
}

function ExportSeedScreen({ onBack }: { onBack: () => void }) {
  const vault = loadVault()!;
  const [pass, setPass] = useState('');
  const [seedHex, setSeedHex] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast, hideToast] = useToast();

  async function unlock() {
    setErr('');
    try {
      const seed = await decryptSeed(vault.encryptedSeed, pass);
      setSeedHex(Buffer.from(seed).toString('hex'));
      seed.fill(0);
      setPass('');
      haptic('success');
    } catch (e: any) {
      setErr(e?.message ?? 'Wrong passcode');
      haptic('error');
    }
  }

  return (
    <Screen back="/settings">
      <h1 className="title">Export raw seed</h1>
      <p className="subtitle">
        Compatible with any wallet that accepts a 32-byte ed25519 seed (TON Space "raw key" import).
        Not the same as the 24-word phrase — that was your one-time backup at creation.
      </p>
      {!seedHex ? (
        <Card>
          <Field label="Passcode">
            <input
              type="password"
              className="input"
              inputMode="numeric"
              value={pass}
              autoFocus
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void unlock()}
            />
          </Field>
          {err && <div className="error-text">{err}</div>}
          <Button full onClick={() => void unlock()}>Reveal</Button>
        </Card>
      ) : (
        <>
          <div className="warning-text">
            Never share this value. Anyone with it controls this wallet.
          </div>
          <Card>
            <div className="code">{seedHex}</div>
            <Button
              variant="secondary"
              onClick={() => {
                void copyToClipboard(seedHex);
                setToast('Copied seed');
                haptic('light');
              }}
            >
              Copy
            </Button>
            <Button onClick={onBack}>Done</Button>
          </Card>
        </>
      )}
      <Toast message={toast} onDone={hideToast} />
    </Screen>
  );
}

function ChangePasscodeScreen({ onBack }: { onBack: () => void }) {
  const vault = loadVault()!;
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    if (next.length < 4 || next !== next2) {
      setErr('Passcodes must match and be at least 4 characters');
      return;
    }
    setBusy(true);
    try {
      const newVault = await changePasscode(vault.encryptedSeed, cur, next);
      saveVault({ ...vault, encryptedSeed: newVault });
      const seed = await decryptSeed(newVault, next);
      keyring.setSeed(seed);
      haptic('success');
      onBack();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed');
      haptic('error');
    } finally {
      setBusy(false);
      setCur('');
      setNext('');
      setNext2('');
    }
  }

  return (
    <Screen back="/settings">
      <h1 className="title">Change passcode</h1>
      <Card>
        <Field label="Current passcode">
          <input type="password" inputMode="numeric" className="input" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
        </Field>
        <Field label="New passcode">
          <input type="password" inputMode="numeric" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new passcode">
          <input type="password" inputMode="numeric" className="input" value={next2} onChange={(e) => setNext2(e.target.value)} />
        </Field>
        {err && <div className="error-text">{err}</div>}
        <Button full disabled={busy} onClick={() => void submit()}>{busy ? 'Updating…' : 'Save'}</Button>
      </Card>
    </Screen>
  );
}
