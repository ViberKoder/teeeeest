import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';

import { Screen, Card, Button, Field, Toast, useToast } from '../ui/components';
import { copyToClipboard, haptic } from '../services/tma';
import { deriveAccount, accountMetaFor } from '../state/account';
import { encryptSeed } from '../crypto/passcode';
import { saveVault } from '../state/vault';
import { keyring } from '../state/keyring';

type Step = 'show' | 'confirm' | 'passcode' | 'done';

const NETWORK = (import.meta.env.VITE_TON_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';

export function Create() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('show');
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [toast, setToast, hideToast] = useToast();
  const [confirmInputs, setConfirmInputs] = useState<Record<number, string>>({});
  const [confirmError, setConfirmError] = useState('');
  const [passcode, setPasscode] = useState('');
  const [passcode2, setPasscode2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void mnemonicNew(24).then((words) => {
      if (alive) setMnemonic(words);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Pick three random word indices to verify (1-based for UX). */
  const checkIndices = useMemo(() => {
    if (mnemonic.length === 0) return [] as number[];
    const idxs = new Set<number>();
    while (idxs.size < 3) idxs.add(Math.floor(Math.random() * 24));
    return [...idxs].sort((a, b) => a - b);
  }, [mnemonic]);

  function copyAll() {
    void copyToClipboard(mnemonic.join(' '));
    haptic('light');
    setToast('Copied recovery phrase');
  }

  function proceedToConfirm() {
    setStep('confirm');
    setConfirmInputs({});
    setConfirmError('');
  }

  function verify() {
    for (const i of checkIndices) {
      const expected = mnemonic[i]?.trim();
      const got = (confirmInputs[i] ?? '').trim().toLowerCase();
      if (!got || got !== expected) {
        setConfirmError('One of the words does not match. Double-check your backup.');
        haptic('error');
        return;
      }
    }
    setConfirmError('');
    setStep('passcode');
  }

  async function finalize() {
    setErr('');
    if (passcode.length < 4) {
      setErr('Passcode must be at least 4 characters');
      return;
    }
    if (passcode !== passcode2) {
      setErr('Passcodes do not match');
      return;
    }
    setBusy(true);
    try {
      const kp = await mnemonicToPrivateKey(mnemonic);
      // ed25519 seed used by @ton/crypto is the first 32 bytes of secretKey.
      const seed = kp.secretKey.subarray(0, 32);
      const account = deriveAccount(seed, NETWORK);
      const meta = accountMetaFor(account.publicKey, account.address, 'Main', NETWORK);

      const encryptedSeed = await encryptSeed(seed, passcode);
      saveVault({
        v: 1,
        account: meta,
        encryptedSeed,
        watchedJettons: [],
        rmjBackends: {},
      });
      keyring.setSeed(new Uint8Array(seed));
      // Wipe the long-lived mnemonic so it cannot be re-rendered.
      setMnemonic((m) => m.map(() => ''));
      setPasscode('');
      setPasscode2('');
      haptic('success');
      nav('/home', { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to create wallet');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'show') {
    return (
      <Screen back="/">
        <h1 className="title">Your recovery phrase</h1>
        <p className="subtitle">
          24 words are the <strong>only</strong> way to restore this wallet. Write them down on paper
          and store them offline. We do not keep a copy — losing them means losing access.
        </p>

        {!revealed ? (
          <Card>
            <p className="muted">Tap to reveal once. After confirming you've saved them, the words will be wiped from memory.</p>
            <Button onClick={() => setRevealed(true)}>Reveal phrase</Button>
          </Card>
        ) : (
          <>
            <div className="mnemonic-grid">
              {mnemonic.map((w, i) => (
                <div key={i}>
                  <span className="idx">{i + 1}.</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 10 }}>
              <Button variant="secondary" onClick={copyAll} style={{ flex: 1 }}>Copy</Button>
              <Button onClick={proceedToConfirm} style={{ flex: 1 }}>I've written it down</Button>
            </div>
          </>
        )}

        <Toast message={toast} onDone={hideToast} />
      </Screen>
    );
  }

  if (step === 'confirm') {
    return (
      <Screen back="/onboarding/create">
        <h1 className="title">Verify your backup</h1>
        <p className="subtitle">Type the requested words from your recovery phrase.</p>
        <Card>
          {checkIndices.map((i) => (
            <Field key={i} label={`Word #${i + 1}`}>
              <input
                className="input"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={confirmInputs[i] ?? ''}
                onChange={(e) => setConfirmInputs((s) => ({ ...s, [i]: e.target.value }))}
              />
            </Field>
          ))}
          {confirmError && <div className="error-text">{confirmError}</div>}
          <Button full onClick={verify}>Continue</Button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back="/onboarding/create">
      <h1 className="title">Set a passcode</h1>
      <p className="subtitle">
        The passcode encrypts your seed on this device. You'll enter it for every transfer.
        We can't recover it — make it memorable.
      </p>
      <Card>
        <Field label="Passcode">
          <input
            type="password"
            className="input"
            inputMode="numeric"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Confirm passcode">
          <input
            type="password"
            className="input"
            inputMode="numeric"
            value={passcode2}
            onChange={(e) => setPasscode2(e.target.value)}
          />
        </Field>
        {err && <div className="error-text">{err}</div>}
        <Button full disabled={busy} onClick={() => void finalize()}>
          {busy ? 'Creating…' : 'Create wallet'}
        </Button>
      </Card>
    </Screen>
  );
}
