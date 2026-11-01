/**
 * Design / e2e fixtures. Only bundled when VITE_DEMO=1 (see main.tsx).
 * `?demo=welcome|locked|home|empty` jumps straight to a screen; sends just resolve.
 */
import { Address } from '@ton/core';
import { useEffect } from 'react';
import type { Data } from './state/wallet';
import { useWallet } from './state/wallet';
import type { WalletProvider } from './provider/types';

const address = Address.parseRaw('0:' + 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90');
const E = (n: number) => BigInt(Math.round(n * 1e9));
const now = Math.floor(Date.now() / 1000);

const provider: WalletProvider = {
  kind: 'builtin',
  address,
  send: () => new Promise((r) => setTimeout(r, 900)),
};

const peer = (b: string) => '0:' + b.repeat(64).slice(0, 64);
const full: Data = {
  ton: E(3.482),
  egg: { jettonWallet: address, deployed: true, balance: E(9980.5), claimed: E(9980.5) },
  me: { tg_id: 1, address: address.toRawString(), cumulative: String(E(12480.5)), claim_locked: true, banned: false },
  pending: E(2500),
  loading: false,
  error: null,
  activity: [
    { id: '1', kind: 'egg', direction: 'in', amount: E(2500), symbol: 'EGG', decimals: 9, peer: peer('3f'), time: now - 420, comment: 'hatch reward', failed: false },
    { id: '2', kind: 'egg', direction: 'out', amount: E(120), symbol: 'EGG', decimals: 9, peer: peer('9c'), time: now - 7200, comment: 'for the coffee', failed: false },
    { id: '3', kind: 'ton', direction: 'in', amount: E(5), symbol: 'TON', decimals: 9, peer: peer('27'), time: now - 86400 * 2, failed: false },
  ],
};

export default function Demo() {
  const w = useWallet();
  useEffect(() => {
    const mode = new URLSearchParams(location.search).get('demo') ?? 'home';
    if (mode === 'welcome') w.setDemo('welcome');
    else if (mode === 'locked') w.setDemo('locked');
    else if (mode === 'empty')
      w.setDemo('ready', provider, { ...full, pending: 0n, activity: [], egg: { ...full.egg!, balance: 0n, claimed: 0n }, me: null, ton: E(0.4) });
    else w.setDemo('ready', provider, full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
