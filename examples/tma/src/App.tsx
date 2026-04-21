import { useCallback, useEffect, useState } from 'react';
import {
  TonConnectButton,
  useTonAddress,
  useTonConnectUI,
} from '@tonconnect/ui-react';
import { RMJClient, buildJettonTransferPayloadBase64, DEFAULT_ATTACHED_TON_NANO } from '@rmj/sdk';

const BACKEND = import.meta.env.VITE_RMJ_BACKEND_URL as string;
const PROJECT_NAME = (import.meta.env.VITE_PROJECT_NAME as string) ?? 'TapCoin';

const rmj = new RMJClient({ baseUrl: BACKEND });

interface Balance {
  offchain: string;
  inTree: string;
  epoch: number;
}

function nanoToHuman(nano: string): string {
  const bi = BigInt(nano);
  const whole = bi / 1_000_000_000n;
  const frac = bi % 1_000_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '')}`;
}

export function App() {
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [tapping, setTapping] = useState(false);
  const [localExtra, setLocalExtra] = useState(0n); // optimistic UI counter
  const [syncStatus, setSyncStatus] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    try {
      const b = await rmj.getBalance(address);
      setBalance({ offchain: b.cumulativeOffchain, inTree: b.cumulativeInTree, epoch: b.epoch });
      setLocalExtra(0n);
    } catch (e) {
      console.error(e);
    }
  }, [address]);

  useEffect(() => {
    refresh();
    if (!address) return;
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [address, refresh]);

  const tap = useCallback(async () => {
    if (!address || tapping) return;
    setTapping(true);
    try {
      const r = await rmj.recordAction({ address, source: 'tma' });
      if (r.ok && r.delta) {
        setLocalExtra((x) => x + BigInt(r.delta!));
      }
    } finally {
      setTapping(false);
    }
  }, [address, tapping]);

  const syncToWallet = useCallback(async () => {
    if (!address) return;
    setSyncStatus('Fetching proof…');
    try {
      const payload = await rmj.getCustomPayload(address);
      if (!payload) {
        setSyncStatus('Nothing to sync yet — tap first!');
        return;
      }

      // For "sync to wallet" we self-transfer 0 jettons — the piggyback claim
      // materializes pending cumulative into the wallet balance.
      const masterAddress = import.meta.env.VITE_JETTON_MASTER_ADDRESS as string;
      if (!masterAddress) {
        setSyncStatus('VITE_JETTON_MASTER_ADDRESS not set in .env');
        return;
      }

      // Look up user's jetton-wallet via backend or master get method.
      // For simplicity we call the backend which exposes /api/v1/status
      // but for wallet address we rely on master directly. This example
      // uses a naive approach: ask the user to do any outgoing transfer,
      // which Tonkeeper will auto-wrap with our custom payload.

      setSyncStatus(
        'Open Tonkeeper and do any transfer of this jetton — your pending balance will be materialized automatically.',
      );

      // Programmatic path (requires knowing user's jetton-wallet):
      // await tonConnectUI.sendTransaction({ validUntil: ..., messages: [ ... ] });
    } catch (e) {
      setSyncStatus(`Sync failed: ${(e as Error).message}`);
    }
  }, [address, tonConnectUI]);

  const offchainBig = balance ? BigInt(balance.offchain) : 0n;
  const displayedBalance = nanoToHuman((offchainBig + localExtra).toString());

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>{PROJECT_NAME}</h1>
        <TonConnectButton />
      </header>

      {!address && (
        <p style={styles.hint}>Connect your wallet to start earning.</p>
      )}

      {address && (
        <>
          <div style={styles.balance}>
            <div style={styles.balanceLabel}>Your {PROJECT_NAME} balance</div>
            <div style={styles.balanceValue}>{displayedBalance}</div>
            {balance && (
              <div style={styles.balanceSub}>
                settled in epoch {balance.epoch}: {nanoToHuman(balance.inTree)}
              </div>
            )}
          </div>

          <button
            onClick={tap}
            disabled={tapping}
            style={{ ...styles.tap, opacity: tapping ? 0.5 : 1 }}
          >
            💎 TAP
          </button>

          <button onClick={syncToWallet} style={styles.sync}>
            Sync balance to my wallet
          </button>
          {syncStatus && <div style={styles.syncStatus}>{syncStatus}</div>}

          <p style={styles.foot}>
            Rewards automatically show up in your wallet the next time you
            swap or transfer. You pay nothing extra — the claim is embedded
            in any jetton transfer you already do.
          </p>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: 24,
    maxWidth: 420,
    margin: '0 auto',
    color: '#e8e8e8',
    background: '#0e1013',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { margin: 0, fontSize: 24 },
  hint: { opacity: 0.7 },
  balance: {
    background: '#161a20',
    borderRadius: 16,
    padding: 24,
    textAlign: 'center',
  },
  balanceLabel: { fontSize: 13, opacity: 0.6, marginBottom: 8 },
  balanceValue: { fontSize: 42, fontWeight: 700, letterSpacing: -1 },
  balanceSub: { fontSize: 12, opacity: 0.5, marginTop: 6 },
  tap: {
    padding: 20,
    fontSize: 22,
    border: 'none',
    borderRadius: 16,
    background: 'linear-gradient(90deg, #4f8cff, #a55bff)',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 700,
  },
  sync: {
    padding: 14,
    fontSize: 15,
    border: '1px solid #2b2f36',
    borderRadius: 12,
    background: 'transparent',
    color: '#e8e8e8',
    cursor: 'pointer',
  },
  syncStatus: { fontSize: 13, opacity: 0.7, textAlign: 'center' },
  foot: { fontSize: 12, opacity: 0.5, textAlign: 'center', marginTop: 'auto' },
};
