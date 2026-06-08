import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto';

import { Screen, Card, Button, Field } from '../ui/components';
import { deriveAccount, accountMetaFor } from '../state/account';
import { encryptSeed } from '../crypto/passcode';
import { saveVault } from '../state/vault';
import { keyring } from '../state/keyring';
import { haptic } from '../services/tma';

const NETWORK = (import.meta.env.VITE_TON_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';

export function Import() {
  const nav = useNavigate();
  const [phrase, setPhrase] = useState('');
  const [passcode, setPasscode] = useState('');
  const [passcode2, setPasscode2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length !== 24) {
      setErr('Recovery phrase must contain exactly 24 words');
      return;
    }
    if (!(await mnemonicValidate(words))) {
      setErr('Invalid recovery phrase');
      return;
    }
    if (passcode.length < 4 || passcode !== passcode2) {
      setErr('Passcode must match and be at least 4 characters');
      return;
    }
    setBusy(true);
    try {
      const kp = await mnemonicToPrivateKey(words);
      const seed = kp.secretKey.subarray(0, 32);
      const account = deriveAccount(seed, NETWORK);
      const meta = accountMetaFor(account.publicKey, account.address, 'Main', NETWORK);
      const encryptedSeed = await encryptSeed(seed, passcode);
      saveVault({ v: 1, account: meta, encryptedSeed, watchedJettons: [], rmjBackends: {} });
      keyring.setSeed(new Uint8Array(seed));
      setPhrase('');
      setPasscode('');
      setPasscode2('');
      haptic('success');
      nav('/home', { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back="/">
      <h1 className="title">Import existing wallet</h1>
      <p className="subtitle">Paste your 24-word TON recovery phrase. It will be encrypted with your passcode and never sent off-device.</p>
      <Card>
        <Field label="Recovery phrase (24 words)">
          <textarea
            className="textarea"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="word1 word2 word3 …"
          />
        </Field>
        <Field label="Passcode">
          <input type="password" className="input" inputMode="numeric" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        </Field>
        <Field label="Confirm passcode">
          <input type="password" className="input" inputMode="numeric" value={passcode2} onChange={(e) => setPasscode2(e.target.value)} />
        </Field>
        {err && <div className="error-text">{err}</div>}
        <Button full disabled={busy} onClick={() => void submit()}>{busy ? 'Importing…' : 'Import wallet'}</Button>
      </Card>
    </Screen>
  );
}
