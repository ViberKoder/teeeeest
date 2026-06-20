import { useEffect, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import type { JettonBalance, RmjOffchainBalance } from '../types';
import { Modal } from './Modal';
import { colors, layout } from '../styles/theme';
import { formatJettonAmount, parseJettonAmount } from '../utils/format';
import { isConfiguredRmjMaster, isMintlessJetton, resolveRmjBackendForJetton } from '../utils/rmjDetect';
import {
  buildRmjJettonInteraction,
  fetchRmjOffchainBalance,
  formatRmjAmount,
  resolveMasterForMintless,
} from '../services/rmjService';
import { buildStandardJettonTransfer, defaultJettonAttachedTon, parseRecipient } from '../services/transactions';
import { rmjTotalNano } from '../utils/rmjBalance';

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
  const [rmjBalance, setRmjBalance] = useState<RmjOffchainBalance | null>(null);

  const isRmj =
    jetton.isProjectRmj ||
    isConfiguredRmjMaster(jetton.jettonMaster) ||
    isMintlessJetton(jetton.customPayloadApiUri);
  const rmjBackend = resolveRmjBackendForJetton(jetton.jettonMaster, jetton.customPayloadApiUri);

  useEffect(() => {
    if (!isRmj || !rmjBackend) return;
    const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
    void fetchRmjOffchainBalance(rmjBackend, owner, master).then(setRmjBalance);
  }, [isRmj, rmjBackend, jetton, owner]);

  const effectiveMax = isRmj ? rmjTotalNano(rmjBalance, jetton.balanceNano) : jetton.balanceNano;

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const recipient = parseRecipient(to);
      const nano = parseJettonAmount(amount, jetton.decimals);
      if (nano === null || nano <= 0n) throw new Error('Некорректная сумма.');
      if (nano > effectiveMax) throw new Error('Недостаточно jetton (учитывая невостребованный RMJ).');

      let jettonWallet = jetton.jettonWallet;
      let payload: string;
      let attached = BigInt(defaultJettonAttachedTon());
      let stateInit: string | undefined;

      if (isRmj && rmjBackend) {
        const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
        const tx = await buildRmjJettonInteraction(rmjBackend, owner, master, {
          jettonAmountNano: nano,
          toOwner: recipient,
          requireProof: false,
        });
        jettonWallet = tx.jettonWallet;
        payload = tx.payload;
        attached = BigInt(tx.amount);
        stateInit = tx.stateInit;
        if (tx.proofAttached) {
          /* Merkle proof piggy-backed — RMJ delta materializes in same tx */
        }
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
          stateInitB64: stateInit,
        },
      ]);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const maxLabel = isRmj && rmjBalance
    ? formatRmjAmount(rmjBalance.cumulativeOffchain, rmjBalance.balanceDisplay)
    : formatJettonAmount(jetton.balanceNano, jetton.decimals);

  return (
    <Modal title={`Отправить ${jetton.symbol}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 14 }}>
        Доступно: {maxLabel} {jetton.symbol}
        {isRmj && jetton.balanceNano === 0n && rmjBalance && BigInt(rmjBalance.cumulativeOffchain) > 0n && (
          <div style={{ marginTop: 6, color: colors.rmj, fontSize: 12 }}>
            Невостребованный RMJ — Merkle proof подставится автоматически при отправке.
          </div>
        )}
        {isRmj && rmjBalance?.claimable && (
          <div style={{ marginTop: 6, color: colors.rmj, fontSize: 12 }}>
            Proof API готов — delta заклеймится в этой же транзакции (TEP-177).
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
          placeholder={`0 — макс. ${maxLabel}`}
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
        {sending ? 'Отправка + proof…' : 'Отправить jetton'}
      </button>
    </Modal>
  );
}
