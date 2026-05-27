import { useCallback, useEffect, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import {
  type BalanceDisplayMode,
  RMJClient,
  formatBalanceDisplay,
  prepareRollingClaimSync,
} from '@rmj/sdk';

const BACKEND = import.meta.env.VITE_RMJ_BACKEND_URL as string;
const JETTON_MASTER = (import.meta.env.VITE_JETTON_MASTER_ADDRESS as string | undefined)?.trim() || '';
const TON_NETWORK =
  (import.meta.env.VITE_TON_NETWORK as string | undefined) === 'testnet' ? 'testnet' : 'mainnet';
const PROJECT_NAME = (import.meta.env.VITE_PROJECT_NAME as string) ?? 'RMJ Wallet';

const rmj = new RMJClient({
  baseUrl: BACKEND,
  jettonMasterAddress: JETTON_MASTER || undefined,
  tonNetwork: TON_NETWORK,
});

interface Balance {
  offchain: string;
  inTree: string;
  epoch: number;
  displayMode: BalanceDisplayMode;
}

const card: React.CSSProperties = {
  maxWidth: 420,
  margin: '0 auto',
  padding: 20,
  fontFamily: 'system-ui, sans-serif',
};

export function App() {
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [status, setStatus] = useState('');
  const [backendEpoch, setBackendEpoch] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    try {
      const [b, st] = await Promise.all([rmj.getBalance(address), rmj.getStatus()]);
      setBalance({
        offchain: b.cumulativeOffchain,
        inTree: b.cumulativeInTree,
        epoch: b.epoch,
        displayMode: b.balanceDisplay,
      });
      setBackendEpoch(st.epoch);
    } catch (e) {
      console.error(e);
      setStatus('Backend unreachable — check VITE_RMJ_BACKEND_URL');
    }
  }, [address]);

  useEffect(() => {
    refresh();
    if (!address) return;
    const id = setInterval(refresh, 8_000);
    return () => clearInterval(id);
  }, [address, refresh]);

  const claimOnChain = useCallback(async () => {
    if (!address) return;
    if (!JETTON_MASTER) {
      setStatus('Set VITE_JETTON_MASTER_ADDRESS in .env');
      return;
    }
    setStatus('Fetching Merkle proof from RMJ backend…');
    try {
      const prepared = await prepareRollingClaimSync(rmj, address);
      if (!prepared) {
        setStatus('Nothing to claim — wait for taps and the next Merkle epoch.');
        return;
      }

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [prepared.tonConnectMessage],
      });

      setStatus(
        prepared.jettonWallet.needsDeploy
          ? 'Sent — deploying jetton-wallet + claim. Refresh in ~30s.'
          : `Sent — claim delta ${prepared.claim.amount} (epoch ${prepared.claim.epoch}).`,
      );
      setTimeout(refresh, 4_000);
    } catch (e) {
      const msg = (e as Error).message;
      setStatus(msg.includes('reject') || msg.includes('Reject') ? 'Cancelled.' : msg);
    }
  }, [address, tonConnectUI, refresh]);

  const displayOffchain = balance
    ? formatBalanceDisplay(balance.offchain, balance.displayMode)
    : '—';
  const displayInTree = balance
    ? formatBalanceDisplay(balance.inTree, balance.displayMode)
    : '—';

  return (
    <div style={card}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{PROJECT_NAME}</h1>
        <TonConnectButton />
      </header>

      <p style={{ color: '#555', fontSize: 14, lineHeight: 1.45 }}>
        Phase 1: RMJ-aware dApp with TON Connect. Full embedded wallet (MyTonWallet-style) — see{' '}
        <code>docs/WEB_WALLET.md</code>.
      </p>

      {!BACKEND && (
        <p style={{ color: '#c00' }}>Configure VITE_RMJ_BACKEND_URL in .env</p>
      )}

      {address ? (
        <>
          <section
            style={{
              background: '#f4f6f8',
              borderRadius: 12,
              padding: 16,
              marginTop: 16,
            }}
          >
            <div style={{ fontSize: 12, color: '#666' }}>Off-chain (game)</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{displayOffchain}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 12 }}>
              In Merkle tree (epoch {balance?.epoch ?? '…'})
            </div>
            <div style={{ fontSize: 18 }}>{displayInTree}</div>
            {backendEpoch != null && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                Backend epoch: {backendEpoch}
                {JETTON_MASTER ? '' : ' · set VITE_JETTON_MASTER_ADDRESS for claim'}
              </div>
            )}
          </section>

          <button
            type="button"
            onClick={claimOnChain}
            disabled={!JETTON_MASTER}
            style={{
              width: '100%',
              marginTop: 16,
              padding: 14,
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 10,
              border: 'none',
              background: JETTON_MASTER ? '#0098ea' : '#aaa',
              color: '#fff',
              cursor: JETTON_MASTER ? 'pointer' : 'not-allowed',
            }}
          >
            Claim / sync on-chain
          </button>
          <p style={{ fontSize: 12, color: '#666' }}>
            Sends TEP-74 transfer with <code>rolling_claim</code> custom_payload (~0.1 TON gas).
          </p>
        </>
      ) : (
        <p style={{ marginTop: 24 }}>Connect a wallet to view RMJ balance and claim.</p>
      )}

      {status && (
        <p style={{ fontSize: 13, marginTop: 12, color: '#333' }} role="status">
          {status}
        </p>
      )}
    </div>
  );
}
