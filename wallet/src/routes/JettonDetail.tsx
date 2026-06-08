import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Screen, Card, Button, IconAvatar, RmjBadge } from '../ui/components';
import { loadVault } from '../state/vault';
import { buildJettonList, type JettonEntry } from '../state/jettons';
import { formatBigUnits, shortAddress, timeAgo } from '../util/format';

export function JettonDetail() {
  const { master = '' } = useParams();
  const nav = useNavigate();
  const vault = loadVault();
  const masterAddr = decodeURIComponent(master);
  const [entry, setEntry] = useState<JettonEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!vault) return;
    const list = await buildJettonList(vault.account.network, vault.account.address);
    setEntry(list.find((e) => e.master === masterAddr) ?? null);
    setLoading(false);
  }, [vault, masterAddr]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!vault) return null;
  if (loading && !entry) {
    return (
      <Screen back="/home">
        <span className="muted">Loading…</span>
      </Screen>
    );
  }
  if (!entry) {
    return (
      <Screen back="/home">
        <Card>
          <div>Jetton not found in your wallet.</div>
          <Button onClick={() => nav('/home')}>Back</Button>
        </Card>
      </Screen>
    );
  }

  const onchain = BigInt(entry.onchainBalanceNano);
  const pending = entry.rmjPending ? BigInt(entry.rmjPending.amount) : 0n;
  const total = onchain + pending;

  return (
    <Screen back="/home">
      <div className="row">
        <IconAvatar url={entry.image} label={entry.symbol || entry.name} />
        <div className="meta">
          <div className="name" style={{ fontSize: 18 }}>{entry.symbol || entry.name}</div>
          <div className="sub">{entry.name}</div>
        </div>
        {entry.isRmj && <RmjBadge />}
      </div>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <div className="hero-balance">{formatBigUnits(total, entry.decimals)}</div>
          <div className="hero-balance-sub">{entry.symbol}</div>
        </div>

        {entry.isRmj && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <Row label="On-chain (already claimed)" value={`${formatBigUnits(onchain, entry.decimals)} ${entry.symbol}`} />
            {pending > 0n && (
              <Row
                label="Pending claim (off-chain)"
                value={`+${formatBigUnits(pending, entry.decimals)} ${entry.symbol}`}
                accent
              />
            )}
            {entry.rmjOffchain && (
              <Row
                label="Lifetime cumulative"
                value={`${formatBigUnits(entry.rmjOffchain.cumulativeOffchain, entry.decimals)} ${entry.symbol}`}
              />
            )}
            {entry.rmjPending && (
              <Row label="Epoch" value={String(entry.rmjPending.epoch)} />
            )}
          </div>
        )}
      </Card>

      <div className="row" style={{ gap: 10 }}>
        <Button
          variant="primary"
          style={{ flex: 1 }}
          onClick={() => nav(`/send/jetton/${encodeURIComponent(entry.master)}`)}
        >
          Send
        </Button>
        <Button variant="secondary" style={{ flex: 1 }} onClick={() => nav('/receive')}>
          Receive
        </Button>
      </div>

      {entry.isRmj && pending > 0n && (
        <Card>
          <div style={{ fontWeight: 600 }}>How the claim works</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Your pending {entry.symbol} lives off-chain in the project's Merkle tree.
            When you tap <strong>Send</strong>, the wallet attaches the project's signed Merkle
            proof to the very first transfer. The jetton-wallet credits the delta and forwards
            your transfer in one transaction — you only pay the standard transfer gas.
          </div>
          {entry.rmjPending && (
            <div className="code" style={{ color: 'var(--text-muted)' }}>
              proof epoch {entry.rmjPending.epoch} · root {shortAddress(entry.rmjPending.root, 6, 6)} ·
              expires {timeAgo(entry.rmjPending.expiredAt)}
            </div>
          )}
          <Button variant="secondary" onClick={() => nav(`/send/jetton/${encodeURIComponent(entry.master)}?claim=self`)}>
            Claim now (self-transfer)
          </Button>
        </Card>
      )}

      <Card>
        <div className="muted" style={{ fontSize: 13 }}>Jetton master</div>
        <div className="code">{entry.master}</div>
        <div className="muted" style={{ fontSize: 13 }}>Your jetton-wallet {entry.walletActive ? '' : '(not yet deployed)'}</div>
        <div className="code">{entry.jettonWallet}</div>
      </Card>
    </Screen>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ? 'var(--accent-strong)' : 'inherit' }}>{value}</span>
    </div>
  );
}
