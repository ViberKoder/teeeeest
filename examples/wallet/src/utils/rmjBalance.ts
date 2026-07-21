import { formatBalanceDisplay, type BalanceDisplayMode } from '@rmj/sdk';
import type { RmjOffchainBalance } from '../types';
import { formatJettonAmount } from './format';

function fmt(amount: string, mode: BalanceDisplayMode): string {
  return formatBalanceDisplay(amount, mode);
}

export type RmjLifecycleStatus =
  | 'empty'
  | 'accruing_offchain'
  | 'waiting_merkle'
  | 'in_merkle'
  | 'claimable';

export function rmjLifecycleStatus(b: RmjOffchainBalance | null): RmjLifecycleStatus {
  if (!b) return 'empty';
  const off = BigInt(b.cumulativeOffchain);
  const tree = BigInt(b.cumulativeInTree);
  if (off === 0n && tree === 0n) return 'empty';
  if (b.claimable) return 'claimable';
  if (tree > 0n) return 'in_merkle';
  if (off > 0n) return 'accruing_offchain';
  return 'waiting_merkle';
}

export function rmjStatusLabel(status: RmjLifecycleStatus): string {
  switch (status) {
    case 'empty':
      return 'Нет начислений';
    case 'accruing_offchain':
      return 'Начислено off-chain · ждёт Merkle';
    case 'waiting_merkle':
      return 'Ожидает попадания в дерево';
    case 'in_merkle':
      return 'В Merkle · proof на первом tx';
    case 'claimable':
      return 'Merkle proof готов · клейм при отправке';
  }
}

/** Total user-facing RMJ amount (off-chain cumulative is source of truth for rewards). */
export function rmjTotalNano(b: RmjOffchainBalance | null, onChainNano: bigint): bigint {
  if (!b) return onChainNano;
  const off = BigInt(b.cumulativeOffchain);
  return off > onChainNano ? off : onChainNano;
}

export function rmjUnclaimedNano(b: RmjOffchainBalance | null, onChainNano: bigint): bigint {
  if (!b) return 0n;
  const off = BigInt(b.cumulativeOffchain);
  return off > onChainNano ? off - onChainNano : 0n;
}

export function formatRmjTotalDisplay(
  b: RmjOffchainBalance | null,
  onChainNano: bigint,
  decimals: number,
): string {
  if (b && BigInt(b.cumulativeOffchain) > 0n) {
    return fmt(b.cumulativeOffchain, b.balanceDisplay);
  }
  return formatJettonAmount(onChainNano, decimals);
}

export function formatRmjUnclaimedDisplay(
  b: RmjOffchainBalance | null,
  onChainNano: bigint,
  mode: BalanceDisplayMode,
): string | null {
  const delta = rmjUnclaimedNano(b, onChainNano);
  if (delta === 0n) return null;
  return fmt(delta.toString(), mode);
}
