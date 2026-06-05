import { useCallback, useEffect, useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import type { JettonBalance } from '../types';
import type { RmjOffchainBalance } from '../types';
import { colors, layout } from '../styles/theme';
import { formatJettonAmount } from '../utils/format';
import {
  isConfiguredRmjMaster,
  isMintlessJetton,
  resolveRmjBackendForJetton,
} from '../utils/rmjDetect';
import {
  buildRmjClaimTransaction,
  fetchRmjOffchainBalance,
  formatRmjAmount,
  resolveMasterForMintless,
} from '../services/rmjService';

interface Props {
  jetton: JettonBalance;
  owner: string;
  onSend: (jetton: JettonBalance) => void;
}

export function JettonRow({ jetton, owner, onSend }: Props) {
  const [tonConnectUI] = useTonConnectUI();
  const [rmjBalance, setRmjBalance] = useState<RmjOffchainBalance | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [status, setStatus] = useState('');

  const isRmj =
    isConfiguredRmjMaster(jetton.jettonMaster) || isMintlessJetton(jetton.customPayloadApiUri);
  const rmjBackend = resolveRmjBackendForJetton(jetton.jettonMaster, jetton.customPayloadApiUri);

  const refreshRmj = useCallback(async () => {
    if (!isRmj || !rmjBackend) {
      setRmjBalance(null);
      return;
    }
    const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
    const b = await fetchRmjOffchainBalance(rmjBackend, owner, master);
    setRmjBalance(b);
  }, [isRmj, rmjBackend, jetton.jettonMaster, jetton.customPayloadApiUri, owner]);

  useEffect(() => {
    void refreshRmj();
    if (!isRmj || !rmjBackend) return;
    const id = setInterval(() => void refreshRmj(), 12_000);
    return () => clearInterval(id);
  }, [refreshRmj, isRmj, rmjBackend]);

  const claim = async () => {
    if (!rmjBackend) return;
    setClaimBusy(true);
    setStatus('');
    try {
      const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
      const tx = await buildRmjClaimTransaction(rmjBackend, owner, master);
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: tx.jettonWallet,
            amount: tx.amount,
            payload: tx.payload,
            stateInit: tx.stateInit,
          },
        ],
      });
      setStatus('Claim sent — balance updates after confirmation.');
      await refreshRmj();
    } catch (e) {
      const msg = (e as Error).message;
      setStatus(msg.includes('reject') || msg.includes('Rejected') ? 'Cancelled.' : msg);
    } finally {
      setClaimBusy(false);
    }
  };

  const onChainDisplay = formatJettonAmount(jetton.balanceNano, jetton.decimals);
  const pendingOffchain =
    rmjBalance && BigInt(rmjBalance.cumulativeOffchain) > jetton.balanceNano
      ? formatRmjAmount(
          (BigInt(rmjBalance.cumulativeOffchain) - jetton.balanceNano).toString(),
          rmjBalance.balanceDisplay,
        )
      : null;

  return (
    <article
      style={{
        ...layout.card,
        padding: 14,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        borderColor: isRmj ? colors.rmjDim : colors.border,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: colors.surfaceRaised,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          border: `1px solid ${colors.border}`,
        }}
      >
        {jetton.image ? (
          <img src={jetton.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.textMuted }}>
            {jetton.symbol.slice(0, 3)}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {jetton.name}
              {isRmj && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: colors.rmj,
                    textTransform: 'uppercase',
                  }}
                >
                  RMJ
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>{jetton.symbol}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{onChainDisplay}</div>
            {pendingOffchain && (
              <div style={{ fontSize: 12, color: colors.rmj, marginTop: 2 }}>+{pendingOffchain} pending</div>
            )}
          </div>
        </div>

        {isRmj && rmjBalance && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(232, 168, 56, 0.08)',
              border: `1px solid rgba(232, 168, 56, 0.25)`,
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            Off-chain: {formatRmjAmount(rmjBalance.cumulativeOffchain, rmjBalance.balanceDisplay)} · epoch{' '}
            {rmjBalance.epoch} · in tree:{' '}
            {formatRmjAmount(rmjBalance.cumulativeInTree, rmjBalance.balanceDisplay)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onSend(jetton)}
            style={{ ...layout.btn, ...layout.btnGhost, padding: '7px 12px', fontSize: 13 }}
          >
            Send
          </button>
          {isRmj && rmjBalance?.claimable && (
            <button
              type="button"
              disabled={claimBusy}
              onClick={() => void claim()}
              style={{
                ...layout.btn,
                ...layout.btnRmj,
                padding: '7px 12px',
                fontSize: 13,
                opacity: claimBusy ? 0.6 : 1,
              }}
            >
              {claimBusy ? 'Claiming…' : 'Claim on-chain'}
            </button>
          )}
        </div>
        {status && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>{status}</div>}
      </div>
    </article>
  );
}
