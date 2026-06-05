import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import type { JettonBalance } from '../types';
import { Modal } from './Modal';
import { colors, layout } from '../styles/theme';
import { formatJettonAmount, parseJettonAmount } from '../utils/format';
import { isMintlessJetton, resolveRmjBackendForJetton } from '../utils/rmjDetect';
import {
  buildMintlessJettonTransfer,
  resolveMasterForMintless,
} from '../services/rmjService';
import {
  buildStandardJettonTransfer,
  defaultJettonAttachedTon,
  parseRecipient,
} from '../services/transactions';

interface Props {
  jetton: JettonBalance;
  owner: string;
  onClose: () => void;
}

export function SendJettonModal({ jetton, owner, onClose }: Props) {
  const { sendOutgoing, busy } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const isMintless = isMintlessJetton(jetton.customPayloadApiUri);
  const rmjBackend = resolveRmjBackendForJetton(jetton.jettonMaster, jetton.customPayloadApiUri);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const recipient = parseRecipient(to);
      const nano = parseJettonAmount(amount, jetton.decimals);
      if (nano === null || nano <= 0n) throw new Error('Некорректная сумма.');
      if (nano > jetton.balanceNano) throw new Error('Недостаточно jetton.');

      let jettonWallet = jetton.jettonWallet;
      let payload: string;
      let attached = BigInt(defaultJettonAttachedTon());

      if (isMintless && rmjBackend) {
        const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
        const tx = await buildMintlessJettonTransfer(rmjBackend, owner, master, {
          jettonAmountNano: nano,
          toOwner: recipient,
          customPayloadApiUri: jetton.customPayloadApiUri,
        });
        jettonWallet = tx.jettonWallet;
        payload = tx.payload;
        attached = BigInt(tx.amount);
      } else {
        payload = buildStandardJettonTransfer({
          jettonAmountNano: nano,
          toOwner: recipient,
          responseAddress: owner,
        });
      }

      await sendOutgoing([
        {
          to: jettonWallet,
          amountNano: attached,
          payloadB64: payload,
        },
      ]);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title={`Отправить ${jetton.symbol}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 14 }}>
        Доступно: {formatJettonAmount(jetton.balanceNano, jetton.decimals)} {jetton.symbol}
        {isMintless && (
          <div style={{ marginTop: 6, color: colors.rmj, fontSize: 12 }}>
            RMJ mintless: custom_payload подставляется автоматически (TEP-177).
          </div>
        )}
      </div>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Получатель
        <input style={{ ...layout.input, marginTop: 6 }} value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label style={{ display: 'block', marginBottom: 16, fontSize: 13, color: colors.textMuted }}>
        Сумма
        <input
          style={{ ...layout.input, marginTop: 6 }}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`0 — макс. ${formatJettonAmount(jetton.balanceNano, jetton.decimals)}`}
          inputMode="decimal"
        />
      </label>
      {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="button"
        disabled={sending || busy || !to.trim() || !amount.trim()}
        onClick={() => void send()}
        style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: sending || busy ? 0.6 : 1 }}
      >
        {sending ? 'Отправка…' : 'Отправить jetton'}
      </button>
    </Modal>
  );
}
