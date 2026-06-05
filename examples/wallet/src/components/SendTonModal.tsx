import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { Modal } from './Modal';
import { colors, layout } from '../styles/theme';
import { parseRecipient } from '../services/transactions';
import { sendTonTransfer } from '../wallet/send';

interface Props {
  onClose: () => void;
}

export function SendTonModal({ onClose }: Props) {
  const { session, busy } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!session) return;
    setSending(true);
    setError('');
    try {
      const recipient = parseRecipient(to);
      const nano = BigInt(Math.floor(parseFloat(amount) * 1e9));
      if (nano <= 0n) throw new Error('Сумма должна быть больше нуля.');

      await sendTonTransfer(session.contract, session.keyPair, {
        to: recipient,
        amountNano: nano,
        comment: comment.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title="Отправить TON" onClose={onClose}>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Получатель (EQ… / UQ…)
        <input style={{ ...layout.input, marginTop: 6 }} value={to} onChange={(e) => setTo(e.target.value)} placeholder="UQ…" />
      </label>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Сумма (TON)
        <input
          style={{ ...layout.input, marginTop: 6 }}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
        />
      </label>
      <label style={{ display: 'block', marginBottom: 16, fontSize: 13, color: colors.textMuted }}>
        Комментарий (опционально)
        <input style={{ ...layout.input, marginTop: 6 }} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="button"
        disabled={sending || busy || !to.trim()}
        onClick={() => void send()}
        style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: sending || busy ? 0.6 : 1 }}
      >
        {sending ? 'Отправка…' : `Отправить ${amount} TON`}
      </button>
    </Modal>
  );
}
