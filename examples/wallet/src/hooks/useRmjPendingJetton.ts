import { useCallback, useEffect, useState } from 'react';
import { fetchJettonMetadata } from '../services/tonapi';
import { fetchRmjOffchainBalance, getRmjClient } from '../services/rmjService';
import type { JettonBalance } from '../types';
import { RMJ_BACKEND_URL, RMJ_JETTON_MASTER } from '../config';
import { Address } from '@ton/core';

/**
 * When RMJ is configured but the user has no on-chain jetton-wallet yet,
 * TonAPI returns no balance row. Surface a synthetic jetton card from env + metadata.
 */
export function useRmjPendingJetton(
  owner: string | null,
  existingJettons: JettonBalance[],
): JettonBalance | null {
  const [pending, setPending] = useState<JettonBalance | null>(null);

  const load = useCallback(async () => {
    if (!owner || !RMJ_JETTON_MASTER || !RMJ_BACKEND_URL) {
      setPending(null);
      return;
    }

    const masterFriendly = Address.parse(RMJ_JETTON_MASTER).toString({
      urlSafe: true,
      bounceable: false,
    });

    const alreadyListed = existingJettons.some((j) =>
      Address.parse(j.jettonMaster).equals(Address.parse(RMJ_JETTON_MASTER)),
    );
    if (alreadyListed) {
      setPending(null);
      return;
    }

    const offchain = await fetchRmjOffchainBalance(RMJ_BACKEND_URL, owner, RMJ_JETTON_MASTER);
    if (!offchain || BigInt(offchain.cumulativeOffchain) === 0n) {
      setPending(null);
      return;
    }

    const meta = await fetchJettonMetadata(RMJ_JETTON_MASTER);
    const rmj = getRmjClient(RMJ_BACKEND_URL, RMJ_JETTON_MASTER);
    let jettonWallet = '';
    try {
      const jw = await rmj.getJettonWallet(owner);
      jettonWallet = jw.jettonWallet;
    } catch {
      jettonWallet = '';
    }

    setPending({
      jettonMaster: masterFriendly,
      jettonWallet,
      balanceNano: 0n,
      name: meta.name ?? 'RMJ Token',
      symbol: meta.symbol ?? 'RMJ',
      decimals: meta.decimals ?? 0,
      image: meta.image,
      customPayloadApiUri: meta.customPayloadApiUri,
    });
  }, [owner, existingJettons]);

  useEffect(() => {
    void load();
    if (!owner) return;
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [owner, load]);

  return pending;
}
