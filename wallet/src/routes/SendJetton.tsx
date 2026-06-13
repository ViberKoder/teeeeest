import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Address } from '@ton/core';

import { Screen, Card, Button, Field, RmjBadge } from '../ui/components';
import { loadVault } from '../state/vault';
import { buildJettonList, type JettonEntry } from '../state/jettons';
import { fetchRmjPending } from '../services/rmj';
import { broadcastJettonTransfer, DEFAULT_JETTON_GAS_NANO, DEFAULT_RMJ_CLAIM_GAS_NANO, DEFAULT_RMJ_SEND_GAS_NANO } from '../services/tx';
import { keyring } from '../state/keyring';
import { decryptSeed } from '../crypto/passcode';
import { formatBigUnits, parseUnitsToNano, shortAddress } from '../util/format';
import { haptic } from '../services/tma';

export function SendJetton() {
  const { master = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const vault = loadVault();
  const masterAddr = decodeURIComponent(master);

  const [entry, setEntry] = useState<JettonEntry | null>(null);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const claimMode = params.get('claim') === 'self';

  const refresh = useCallback(async () => {
    if (!vault) return;
    const list = await buildJettonList(vault.account.network, vault.account.address);
    const e = list.find((x) => x.master === masterAddr) ?? null;
    setEntry(e);
    if (claimMode && e && !to) {
      setTo(vault.account.address);
      setAmount('0');
    }
  }, [vault, masterAddr, claimMode, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onchain = entry ? BigInt(entry.onchainBalanceNano) : 0n;
  const pending = entry?.rmjPending ? BigInt(entry.rmjPending.amount) : 0n;
  const total = onchain + pending;

  const parsedAmount = useMemo(() => {
    if (!entry) return null;
    try {
      return parseUnitsToNano(amount, entry.decimals);
    } catch {
      return null;
    }
  }, [amount, entry]);

  const insufficient = entry && parsedAmount !== null && parsedAmount > total;

  function goConfirm() {
    setErr('');
    if (!entry) return;
    if (parsedAmount === null) {
      setErr('Invalid amount');
      return;
    }
    if (!claimMode && parsedAmount === 0n) {
      setErr('Enter an amount above 0');
      return;
    }
    try {
      Address.parse(to.trim());
    } catch {
      setErr('Invalid recipient address');
      return;
    }
    if (insufficient) {
      setErr('Amount exceeds total available balance (on-chain + pending)');
      return;
    }
    setStep('confirm');
  }

  async function submit() {
    if (!vault || !entry) return;
    setErr('');
    setBusy(true);
    try {
      /**
       * Always refresh the RMJ proof immediately before submitting so the
       * voucher / proof we attach matches the current epoch — stale roots are
       * rejected by the wallet contract.
       */
      let customPayload: string | null = null;
      let stateInit: string | null = null;
      const needsClaimPayload = pending > 0n || !entry.walletActive;
      if (entry.isRmj && entry.customPayloadApiUri && needsClaimPayload) {
        const fresh = await fetchRmjPending(entry.customPayloadApiUri, vault.account.address).catch(() => null);
        if (!fresh?.customPayload) {
          throw new Error(
            'Mintless proof unavailable — wait for the next epoch or try again in a minute',
          );
        }
        customPayload = fresh.customPayload;
        stateInit = fresh.stateInit;
      } else if (entry.isRmj && entry.customPayloadApiUri) {
        const fresh = await fetchRmjPending(entry.customPayloadApiUri, vault.account.address).catch(() => null);
        if (fresh?.customPayload) {
          customPayload = fresh.customPayload;
          stateInit = fresh.stateInit;
        }
      }

      const externalRecipient =
        Address.parse(to.trim()).toRawString() !== Address.parse(vault.account.address).toRawString();
      const attachedTon =
        stateInit || customPayload
          ? externalRecipient || stateInit
            ? DEFAULT_RMJ_SEND_GAS_NANO
            : DEFAULT_RMJ_CLAIM_GAS_NANO
          : DEFAULT_JETTON_GAS_NANO;

      // Unlock fresh (allow user to use either an already-unlocked keyring or a one-shot passcode).
      if (keyring.isLocked()) {
        if (!passcode) {
          setErr('Enter passcode to authorize');
          setBusy(false);
          return;
        }
        const seed = await decryptSeed(vault.encryptedSeed, passcode);
        keyring.setSeed(seed);
        setPasscode('');
      }

      await broadcastJettonTransfer({
        network: vault.account.network,
        fromOwner: vault.account.address,
        jettonWallet: entry.jettonWallet,
        toOwner: to.trim(),
        jettonAmountNano: parsedAmount ?? 0n,
        forwardCommentText: comment.trim() || null,
        forwardTonAmountNano: comment.trim() ? 1n : 1n,
        customPayloadBase64: customPayload,
        jettonWalletStateInitBase64: stateInit,
        attachedTonNano: attachedTon,
      });
      haptic('success');
      setStep('done');
    } catch (e: any) {
      setErr(e?.message ?? 'Transfer failed');
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  if (!vault) return null;
  if (!entry) {
    return (
      <Screen back="/home">
        <span className="muted">Loading jetton…</span>
      </Screen>
    );
  }

  if (step === 'done') {
    return (
      <Screen>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>✓</div>
          <h2 className="title">Transfer sent</h2>
          <p className="subtitle">
            Your transaction is being processed. {pending > 0n && entry.isRmj && (
              <>The pending {entry.symbol} were claimed automatically in the same transaction.</>
            )}
          </p>
          <Button onClick={() => nav('/home', { replace: true })}>Back to wallet</Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen back={`/jettons/${encodeURIComponent(entry.master)}`}>
      <h1 className="title">
        Send {entry.symbol || entry.name}
        {entry.isRmj && <span style={{ marginLeft: 8, verticalAlign: 'middle' }}><RmjBadge /></span>}
      </h1>

      {step === 'form' && (
        <>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Available</span>
              <span style={{ fontWeight: 600 }}>
                {formatBigUnits(total, entry.decimals)} {entry.symbol}
              </span>
            </div>
            {pending > 0n && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 13 }}>incl. pending claim</span>
                <span style={{ color: 'var(--accent-strong)', fontSize: 13 }}>
                  +{formatBigUnits(pending, entry.decimals)} {entry.symbol}
                </span>
              </div>
            )}
          </Card>
          <Card>
            <Field label="Recipient address">
              <input
                className="input"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="EQ…"
              />
            </Field>
            <Field label="Amount">
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Comment (optional)">
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={120} />
            </Field>
            {err && <div className="error-text">{err}</div>}
            <Button full onClick={goConfirm}>Continue</Button>
          </Card>
          {entry.isRmj && pending > 0n && (
            <div className="muted" style={{ fontSize: 13, padding: '0 4px' }}>
              The {formatBigUnits(pending, entry.decimals)} {entry.symbol} pending will be claimed in the same transaction
              {!entry.walletActive && ' and your jetton-wallet will be deployed on-chain'}.
            </div>
          )}
        </>
      )}

      {step === 'confirm' && (
        <Card>
          <div className="section-title">Confirm transaction</div>
          <Row label="To" value={shortAddress(to.trim(), 6, 6)} />
          <Row label="Amount" value={`${formatBigUnits(parsedAmount ?? 0n, entry.decimals)} ${entry.symbol}`} />
          {entry.isRmj && entry.rmjPending && (
            <Row label="Will claim" value={`+${formatBigUnits(pending, entry.decimals)} ${entry.symbol}`} accent />
          )}
          {!entry.walletActive && (
            <Row label="Deploy" value="Yes (first claim)" />
          )}
          <Row
            label="Network fee"
            value={`~${entry.isRmj && (pending > 0n || !entry.walletActive) ? '0.3–0.35' : '0.05'} TON`}
          />
          {keyring.isLocked() && (
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

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ? 'var(--accent-strong)' : 'inherit' }}>{value}</span>
    </div>
  );
}
