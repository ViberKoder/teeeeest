import { useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
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
  const [tonConnectUI] = useTonConnectUI();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isMintless = isMintlessJetton(jetton.customPayloadApiUri);
  const rmjBackend = resolveRmjBackendForJetton(jetton.jettonMaster, jetton.customPayloadApiUri);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const recipient = parseRecipient(to);
      const nano = parseJettonAmount(amount, jetton.decimals);
      if (nano === null || nano <= 0n) throw new Error('Invalid amount.');
      if (nano > jetton.balanceNano) throw new Error('Insufficient jetton balance.');

      let jettonWallet = jetton.jettonWallet;
      let payload: string;
      let attached = defaultJettonAttachedTon();

      if (isMintless && rmjBackend) {
        const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
        const tx = await buildMintlessJettonTransfer(rmjBackend, owner, master, {
          jettonAmountNano: nano,
          toOwner: recipient,
          customPayloadApiUri: jetton.customPayloadApiUri,
        });
        jettonWallet = tx.jettonWallet;
        payload = tx.payload;
        attached = tx.amount;
      } else {
        payload = buildStandardJettonTransfer({
          jettonAmountNano: nano,
          toOwner: recipient,
          responseAddress: owner,
        });
      }

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: jettonWallet,
            amount: attached,
            payload,
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
    <Modal title={`Send ${jetton.symbol}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 14 }}>
        Available: {formatJettonAmount(jetton.balanceNano, jetton.decimals)} {jetton.symbol}
        {isMintless && (
          <div style={{ marginTop: 6, color: colors.rmj, fontSize: 12 }}>
            RMJ mintless: claim payload auto-attached (TEP-177).
          </div>
        )}
      </div>
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: colors.textMuted }}>
        Recipient
        <input style={{ ...layout.input, marginTop: 6 }} value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label style={{ display: 'block', marginBottom: 16, fontSize: 13, color: colors.textMuted }}>
        Amount
        <input
          style={{ ...layout.input, marginTop: 6 }}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`0 — max ${formatJettonAmount(jetton.balanceNano, jetton.decimals)}`}
          inputMode="decimal"
        />
      </label>
      {error && <div style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="button"
        disabled={busy || !to.trim() || !amount.trim()}
        onClick={() => void send()}
        style={{ ...layout.btn, ...layout.btnPrimary, width: '100%', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Confirm in wallet…' : 'Send jetton'}
      </button>
    </Modal>
  );
}
