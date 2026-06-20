import { useCallback, useEffect, useState } from 'react';
import { Address } from '@ton/core';
import { fetchJettonMetadata } from '../services/tonapi';
import { getRmjClient } from '../services/rmjService';
import type { JettonBalance } from '../types';
import { RMJ_JETTON_MASTER, RMJ_BACKEND_URL } from '../config';
import { configuredRmjCustomPayloadApiUri, isRmjConfigured } from '../utils/rmjConfig';

/**
 * Always inject the configured RMJ jetton at the top of the portfolio —
 * even when on-chain balance is 0 and rewards exist only off-chain / in Merkle.
 */
export function useRmjAssets(owner: string | null, tonapiJettons: JettonBalance[]): JettonBalance[] {
  const [merged, setMerged] = useState<JettonBalance[]>(tonapiJettons);

  const merge = useCallback(async () => {
    if (!owner || !isRmjConfigured()) {
      setMerged(tonapiJettons);
      return;
    }

    const masterParsed = Address.parse(RMJ_JETTON_MASTER);
    const masterFriendly = masterParsed.toString({ urlSafe: true, bounceable: false });
    const apiUri = configuredRmjCustomPayloadApiUri();

    const existingIdx = tonapiJettons.findIndex((j) =>
      Address.parse(j.jettonMaster).equals(masterParsed),
    );
    const existing = existingIdx >= 0 ? tonapiJettons[existingIdx] : null;

    const [meta, jwInfo] = await Promise.all([
      fetchJettonMetadata(RMJ_JETTON_MASTER).catch(() => null),
      getRmjClient(RMJ_BACKEND_URL, RMJ_JETTON_MASTER)
        .getJettonWallet(owner)
        .catch(() => null),
    ]);

    const rmjCard: JettonBalance = {
      jettonMaster: masterFriendly,
      jettonWallet: existing?.jettonWallet || jwInfo?.jettonWallet || '',
      balanceNano: existing?.balanceNano ?? 0n,
      name: meta?.name ?? existing?.name ?? 'RMJ Token',
      symbol: meta?.symbol ?? existing?.symbol ?? 'RMJ',
      decimals: meta?.decimals ?? existing?.decimals ?? 0,
      image: meta?.image ?? existing?.image,
      customPayloadApiUri: meta?.customPayloadApiUri ?? apiUri ?? existing?.customPayloadApiUri,
      isProjectRmj: true,
    };

    const rest = tonapiJettons.filter((_, i) => i !== existingIdx);
    setMerged([rmjCard, ...rest]);
  }, [owner, tonapiJettons]);

  useEffect(() => {
    void merge();
    if (!owner || !isRmjConfigured()) return;
    const id = setInterval(() => void merge(), 15_000);
    return () => clearInterval(id);
  }, [owner, merge]);

  return merged;
}
