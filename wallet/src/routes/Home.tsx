import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Screen, Card, Button, IconAvatar, SectionTitle, RmjBadge, Toast, useToast } from '../ui/components';
import { copyToClipboard, haptic } from '../services/tma';
import { loadVault } from '../state/vault';
import { keyring } from '../state/keyring';
import { getAccountInfo, type Network } from '../services/ton';
import { buildJettonList, totalNano, type JettonEntry } from '../state/jettons';
import { formatBigUnits, shortAddress } from '../util/format';

const REFRESH_MS = 12_000;

export function Home() {
  const nav = useNavigate();
  const vault = loadVault();
  const [tonBalance, setTonBalance] = useState<string>('0');
  const [jettons, setJettons] = useState<JettonEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast, hideToast] = useToast();

  const network: Network = vault?.account.network ?? 'mainnet';
  const address = vault?.account.address ?? '';

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [info, list] = await Promise.all([
        getAccountInfo(network, address).catch(() => ({ balance: '0' })),
        buildJettonList(network, address).catch(() => []),
      ]);
      setTonBalance(String(info.balance ?? '0'));
      setJettons(list);
    } finally {
      setLoading(false);
    }
  }, [address, network]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!vault) {
    nav('/', { replace: true });
    return null;
  }

  const copyAddress = () => {
    void copyToClipboard(address);
    haptic('light');
    setToast('Address copied');
  };

  return (
    <Screen>
      <div className="row">
        <IconAvatar label={vault.account.name} />
        <div className="meta" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{vault.account.name}</div>
          <button
            onClick={copyAddress}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: 0,
              textAlign: 'left',
            }}
          >
            {shortAddress(address, 6, 6)} • {network}
          </button>
        </div>
        <div className="spacer" />
        <button
          onClick={() => nav('/settings')}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 22 }}
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>

      <div className="hero">
        <div className="hero-balance">{formatBigUnits(tonBalance, 9, 4)} TON</div>
        <div className="hero-balance-sub">{shortAddress(address, 6, 6)}</div>
      </div>

      <div className="action-row">
        <button className="action" onClick={() => nav('/send')}>
          <Arrow up /> <span>Send</span>
        </button>
        <button className="action" onClick={() => nav('/receive')}>
          <Arrow /> <span>Receive</span>
        </button>
        <button className="action" onClick={() => nav('/jettons/add')}>
          <span style={{ fontSize: 22, lineHeight: 1, marginBottom: 2 }}>+</span>
          <span>Add jetton</span>
        </button>
      </div>

      <SectionTitle>Tokens</SectionTitle>
      <div className="list">
        {loading && jettons.length === 0 && (
          <Card><span className="muted">Loading…</span></Card>
        )}
        {!loading && jettons.length === 0 && (
          <Card>
            <div className="muted">No tokens yet.</div>
            <Button variant="secondary" onClick={() => nav('/jettons/add')}>Add a jetton master</Button>
          </Card>
        )}
        {jettons.map((j) => <JettonRow key={j.master} j={j} onClick={() => nav(`/jettons/${encodeURIComponent(j.master)}`)} />)}
      </div>

      <Toast message={toast} onDone={hideToast} />
    </Screen>
  );
}

function JettonRow({ j, onClick }: { j: JettonEntry; onClick: () => void }) {
  const onchain = BigInt(j.onchainBalanceNano);
  const pending = j.rmjPending ? BigInt(j.rmjPending.amount) : 0n;
  const total = onchain + pending;
  const totalLabel = formatBigUnits(total, j.decimals);
  const pendingLabel = pending > 0n ? `+${formatBigUnits(pending, j.decimals)} pending` : null;

  return (
    <button className="row-item" onClick={onClick}>
      <IconAvatar url={j.image} label={j.symbol || j.name} />
      <div className="meta">
        <div className="name">
          {j.symbol || j.name}
          {j.isRmj && <span style={{ marginLeft: 6 }}><RmjBadge /></span>}
        </div>
        <div className="sub">
          {j.name}
          {!j.walletActive && <span style={{ marginLeft: 6 }}>· not yet on-chain</span>}
        </div>
      </div>
      <div>
        <div className="amount">{totalLabel}</div>
        {pendingLabel && <div className="amount-sub" style={{ color: 'var(--accent-strong)' }}>{pendingLabel}</div>}
      </div>
    </button>
  );
}

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {up ? (
        <>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </>
      ) : (
        <>
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </>
      )}
    </svg>
  );
}
