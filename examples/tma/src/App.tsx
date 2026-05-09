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
    setSyncStatus('Preparing claim transaction…');
    try {
      const payload = await rmj.getCustomPayload(address);
      if (!payload) {
        setSyncStatus('Nothing to claim yet — earn some balance first (or wait for the next epoch).');
        return;
      }

      const jw = await rmj.getJettonWallet(address);

      const transferPayload = buildJettonTransferPayloadBase64({
        jettonAmountNano: 0n,
        toOwner: address,
        responseAddress: address,
        forwardTonAmountNano: 1n,
        customPayload: payload,
      });

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: jw.jettonWallet,
            amount: DEFAULT_ATTACHED_TON_NANO.toString(),
            payload: transferPayload,
            stateInit: jw.walletStateInitBase64 ?? undefined,
          },
        ],
      });

      setSyncStatus(
        jw.needsDeploy
          ? 'Transaction sent — first deployment + claim can take ~30s. Refresh your wallet.'
          : 'Transaction sent — balance should appear after confirmation.',
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Rejected') || msg.includes('reject')) {
        setSyncStatus('Cancelled in wallet.');
      } else {
        setSyncStatus(`Sync failed: ${msg}`);
      }
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
            Claim / sync on-chain (TON Connect)
          </button>
          {syncStatus && <div style={styles.syncStatus}>{syncStatus}</div>}

          <p style={styles.foot}>
            Works even when your wallet app ignores mintless APIs: we attach the Proof API{' '}
            <code style={{ fontSize: 11 }}>custom_payload</code> ourselves via TON Connect
            (self-transfer 0 jettons + claim). ~0.1 TON gas covers fees / wallet deploy.
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
