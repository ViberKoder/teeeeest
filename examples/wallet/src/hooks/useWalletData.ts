import { useCallback, useEffect, useState } from 'react';
import { fetchAccount, fetchJettonBalances, fetchNfts } from '../services/tonapi';
import type { JettonBalance, NftItem, TonAccountInfo } from '../types';

export function useWalletData(address: string | null) {
  const [account, setAccount] = useState<TonAccountInfo | null>(null);
  const [jettons, setJettons] = useState<JettonBalance[]>([]);
  const [nfts, setNfts] = useState<NftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setAccount(null);
      setJettons([]);
      setNfts([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [acc, jt, nft] = await Promise.all([
        fetchAccount(address),
        fetchJettonBalances(address),
        fetchNfts(address),
      ]);
      setAccount(acc);
      setJettons(jt);
      setNfts(nft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
    if (!address) return;
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [address, refresh]);

  return { account, jettons, nfts, loading, error, refresh };
}
