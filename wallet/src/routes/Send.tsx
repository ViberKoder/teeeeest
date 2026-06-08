import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Address, toNano } from '@ton/core';

import { Screen, Card, Button, Field } from '../ui/components';
import { loadVault } from '../state/vault';
import { keyring } from '../state/keyring';
import { decryptSeed } from '../crypto/passcode';
import { broadcastTonTransfer } from '../services/tx';
import { getAccountInfo } from '../services/ton';
import { formatBigUnits, parseUnitsToNano, shortAddress } from '../util/format';
import { haptic } from '../services/tma';

export function SendTon() {
  const nav = useNavigate();
  const vault = loadVault();

  const [balance, setBalance] = useState('0');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [passcode, setPasscode] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!vault) return;
    void getAccountInfo(vault.account.network, vault.account.address)
      .then((i) => setBalance(String(i.balance)))
      .catch(() => undefined);
  }, [vault]);

  const parsed = useMemo(() => {
    try {
      return parseUnitsToNano(amount, 9);
    } catch {
      return null;
    }
  }, [amount]);

  if (!vault) return null;

  function goConfirm() {
    setErr('');
    if (parsed === null || parsed <= 0n) {
      setErr('Enter a valid amount');
      return;
    }
    try {
      Address.parse(to.trim());
    } catch {
      setErr('Invalid recipient address');
      return;
    }
    if (parsed > BigInt(balance) - toNano('0.01')) {
      setErr('Insufficient balance (leave ~0.01 TON for fees)');
      return;
    }
    setStep('confirm');
  }

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      if (keyring.isLocked()) {
        if (!passcode) {
          setErr('Enter passcode to authorize');
          setBusy(false);
          return;
        }
        const seed = await decryptSeed(vault!.encryptedSeed, passcode);
        keyring.setSeed(seed);
        setPasscode('');
      }
      await broadcastTonTransfer({
        network: vault!.account.network,
        fromAddress: vault!.account.address,
        toAddress: to.trim(),
        amountNano: parsed ?? 0n,
        comment: comment.trim() || null,
        bounce: false,
      });
      haptic('success');
      setStep('done');
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to send');
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <Screen>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 56 }}>✓</div>
          <h2 className="title">TON sent</h2>
          <Button onClick={() => nav('/home', { replace: true })}>Back to wallet</Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen back="/home">
      <h1 className="title">Send TON</h1>
      {step === 'form' && (
        <>
          <Card>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Balance</span>
              <span style={{ fontWeight: 600 }}>{formatBigUnits(balance, 9, 4)} TON</span>
            </div>
          </Card>
          <Card>
            <Field label="Recipient">
              <input className="input" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={to} onChange={(e) => setTo(e.target.value)} placeholder="EQ…" />
            </Field>
            <Field label="Amount (TON)">
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Comment (optional)">
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={120} />
            </Field>
            {err && <div className="error-text">{err}</div>}
            <Button full onClick={goConfirm}>Continue</Button>
          </Card>
        </>
      )}
      {step === 'confirm' && (
        <Card>
          <div className="section-title">Confirm</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">To</span>
            <span style={{ fontWeight: 600 }}>{shortAddress(to.trim(), 6, 6)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Amount</span>
            <span style={{ fontWeight: 600 }}>{formatBigUnits(parsed ?? 0n, 9)} TON</span>
          </div>
          {keyring.isLocked() && (
            <Field label="Passcode">
              <input type="password" className="input" inputMode="numeric" autoFocus
                value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            </Field>
          )}
          {err && <div className="error-text">{err}</div>}
          <div className="row" style={{ gap: 10 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setStep('form')}>Back</Button>
            <Button style={{ flex: 1 }} disabled={busy} onClick={() => void submit()}>
              {busy ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </Card>
      )}
    </Screen>
  );
}
