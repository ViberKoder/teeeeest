import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../context/WalletContext';
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
  buildRmjJettonInteraction,
  fetchRmjOffchainBalance,
  formatRmjAmount,
  resolveMasterForMintless,
} from '../services/rmjService';
import {
  formatRmjTotalDisplay,
  formatRmjUnclaimedDisplay,
  rmjLifecycleStatus,
  rmjStatusLabel,
  rmjTotalNano,
  rmjUnclaimedNano,
} from '../utils/rmjBalance';

interface Props {
  jetton: JettonBalance;
  owner: string;
  onSend: (jetton: JettonBalance) => void;
}

export function JettonRow({ jetton, owner, onSend }: Props) {
  const { sendOutgoing } = useWallet();
  const [rmjBalance, setRmjBalance] = useState<RmjOffchainBalance | null>(null);
  const [interactBusy, setInteractBusy] = useState(false);
  const [status, setStatus] = useState('');

  const isRmj =
    jetton.isProjectRmj ||
    isConfiguredRmjMaster(jetton.jettonMaster) ||
    isMintlessJetton(jetton.customPayloadApiUri);
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

  /** First on-chain touch: self-transfer 0 jettons + Merkle proof (deploys wallet if needed). */
  const syncOnChain = async () => {
    if (!rmjBackend) return;
    setInteractBusy(true);
    setStatus('');
    try {
      const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
      const tx = await buildRmjClaimTransaction(rmjBackend, owner, master);
      await sendOutgoing([
        {
          to: tx.jettonWallet,
          amountNano: BigInt(tx.amount),
          payloadB64: tx.payload,
          stateInitB64: tx.stateInit,
        },
      ]);
      setStatus('Merkle proof отправлен — баланс появится on-chain после подтверждения.');
      await refreshRmj();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setInteractBusy(false);
    }
  };

  /** Any RMJ send piggy-backs Merkle proof when available (TEP-177). */
  const interactWithProof = async () => {
    if (!rmjBackend || !rmjBalance?.claimable) {
      onSend(jetton);
      return;
    }
    setInteractBusy(true);
    setStatus('');
    try {
      const master = resolveMasterForMintless(jetton.jettonMaster, jetton.customPayloadApiUri);
      const tx = await buildRmjJettonInteraction(rmjBackend, owner, master, {
        jettonAmountNano: 0n,
        toOwner: owner,
        requireProof: true,
      });
      await sendOutgoing([
        {
          to: tx.jettonWallet,
          amountNano: BigInt(tx.amount),
          payloadB64: tx.payload,
          stateInitB64: tx.stateInit,
        },
      ]);
      setStatus('Первое взаимодействие с proof отправлено.');
      await refreshRmj();
    } catch (e) {
      onSend(jetton);
    } finally {
      setInteractBusy(false);
    }
  };

  const lifecycle = rmjLifecycleStatus(rmjBalance);
  const onChainDisplay = formatJettonAmount(jetton.balanceNano, jetton.decimals);
  const totalDisplay = isRmj
    ? formatRmjTotalDisplay(rmjBalance, jetton.balanceNano, jetton.decimals)
    : onChainDisplay;
  const unclaimedLabel = isRmj
    ? formatRmjUnclaimedDisplay(rmjBalance, jetton.balanceNano, rmjBalance?.balanceDisplay ?? 'integer')
    : null;
  const hasUnclaimed = isRmj && rmjUnclaimedNano(rmjBalance, jetton.balanceNano) > 0n;
  const effectiveMax = isRmj ? rmjTotalNano(rmjBalance, jetton.balanceNano) : jetton.balanceNano;

  return (
    <article
      style={{
        ...layout.card,
        padding: 14,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        borderColor: isRmj ? colors.rmjDim : colors.border,
        boxShadow: jetton.isProjectRmj ? `0 0 0 1px rgba(232, 168, 56, 0.15)` : undefined,
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
            <div style={{ fontWeight: 600, fontSize: 16 }}>{totalDisplay}</div>
            {isRmj && jetton.balanceNano > 0n && hasUnclaimed && (
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                on-chain: {onChainDisplay}
              </div>
            )}
            {unclaimedLabel && (
              <div style={{ fontSize: 12, color: colors.rmj, marginTop: 2 }}>
                {jetton.balanceNano === 0n ? 'невостребовано' : `+${unclaimedLabel} невостребовано`}
              </div>
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
              lineHeight: 1.45,
            }}
          >
            <div style={{ color: colors.rmj, fontWeight: 600, marginBottom: 4 }}>
              {rmjStatusLabel(lifecycle)}
            </div>
            Off-chain: {formatRmjAmount(rmjBalance.cumulativeOffchain, rmjBalance.balanceDisplay)} · epoch{' '}
            {rmjBalance.epoch} · Merkle:{' '}
            {formatRmjAmount(rmjBalance.cumulativeInTree, rmjBalance.balanceDisplay)}
            {rmjBalance.claimable && ' · proof готов'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => (isRmj && hasUnclaimed && rmjBalance?.claimable ? void interactWithProof() : onSend(jetton))}
            disabled={interactBusy || (!isRmj && effectiveMax === 0n)}
            style={{ ...layout.btn, ...layout.btnGhost, padding: '7px 12px', fontSize: 13 }}
          >
            {isRmj && hasUnclaimed ? 'Отправить' : 'Send'}
          </button>
          {isRmj && rmjBalance?.claimable && (
            <button
              type="button"
              disabled={interactBusy}
              onClick={() => void syncOnChain()}
              style={{
                ...layout.btn,
                ...layout.btnRmj,
                padding: '7px 12px',
                fontSize: 13,
                opacity: interactBusy ? 0.6 : 1,
              }}
            >
              {interactBusy ? '…' : 'Sync + proof'}
            </button>
          )}
        </div>
        {status && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>{status}</div>}
      </div>
    </article>
  );
}
