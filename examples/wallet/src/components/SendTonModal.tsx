import { useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { Modal } from './Modal';
import { colors, layout } from '../styles/theme';
import { buildTonTransferPayload, parseRecipient } from '../services/transactions';

interface Props {
  onClose: () => void;
}

export function SendTonModal({ onClose }: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const recipient = parseRecipient(to);
      const nano = BigInt(Math.floor(parseFloat(amount) * 1e9));
      if (nano <= 0n) throw new Error('Amount must be positive.');

      const payload = buildTonTransferPayload(comment);
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: recipient,
            amount: nano.toString(),
            payload: payload || undefined,
          },
        ],
      });
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('reject') || msg.includes('Rejected') ? 'Cancelled in wallet.' : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Send TON" onClose={onClose}>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Recipient (EQ… / UQ…)
        <input style={{ ...layout.input, marginTop: 6 }} value={to} onChange={(e) => setTo(e.target.value)} placeholder="UQ…" />
      </label>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Amount (TON)
        <input
          style={{ ...layout.input, marginTop: 6 }}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <label style={{ display: 'block', marginBottom: 16, fontSize: 13, color: colors.textMuted }}>
        Comment (optional)
        <input style={{ ...layout.input, marginTop: 6 }} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="button"
        disabled={busy || !to.trim()}
        onClick={() => void send()}
        style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Confirm in wallet…' : `Send ${amount} TON`}
      </button>
    </Modal>
  );
}
