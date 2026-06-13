import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { NETWORK } from './constants';
import {
  type ComplianceCheck,
  type ComplianceReport,
  type DiagnosticsResponse,
  type IndexerStatus,
  type RootSyncReport,
  type SyncMetadataResponse,
  type TonConnectTx,
  fetchCompliance,
  fetchDiagnostics,
  fetchIndexerStatus,
  fetchOnChainMerkleRoot,
  fetchSyncMetadata,
  fetchWalletProofSample,
  fetchWalletsBatch,
  postSyncMerkleRoot,
} from './complianceApi';

const ADMIN_JWT_KEY = 'rmj_admin_jwt';

type Props = {
  defaultBackendUrl?: string;
  defaultMaster?: string;
};

const GROUP_LABELS: Record<string, string> = {
  rolling: 'Rolling mint (RMJ)',
  onchain: 'On-chain контракт',
  our_api: 'Наш API',
  toncenter: 'Toncenter',
  tonapi: 'TonAPI',
};

function panelStyle(bg: string, border: string): CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  };
}

function statusColor(pass: boolean | null | undefined): string {
  if (pass === true) return '#15803d';
  if (pass === false) return '#b91c1c';
  return '#b45309';
}

function normalizeRoot(root: string | null | undefined): string {
  return (root ?? '').replace(/^0x/i, '').toLowerCase();
}

function rootsEqual(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const na = normalizeRoot(a);
  const nb = normalizeRoot(b);
  if (!na && !nb) return null;
  if (!na || !nb) return false;
  return na === nb;
}

function shortHex(hex: string | null | undefined, head = 10, tail = 8): string {
  const h = normalizeRoot(hex);
  if (!h) return '—';
  if (h.length <= head + tail + 2) return `0x${h}`;
  return `0x${h.slice(0, head)}…${h.slice(-tail)}`;
}

async function sendTonConnectTx(tonConnectUI: ReturnType<typeof useTonConnectUI>[0], tx: TonConnectTx) {
  await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [
      {
        address: tx.address,
        amount: tx.amount,
        payload: tx.payload,
      },
    ],
  });
}

export function ComplianceTab({ defaultBackendUrl = '', defaultMaster = '' }: Props) {
  const walletAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const envBackend = (import.meta.env.VITE_RMJ_BACKEND_URL as string | undefined)?.trim() || '';
  const envMaster = (import.meta.env.VITE_JETTON_MASTER_ADDRESS as string | undefined)?.trim() || '';

  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl || envBackend);
  const [jettonMaster, setJettonMaster] = useState(defaultMaster || envMaster);
  const [sampleOwner, setSampleOwner] = useState('');
  const [adminJwt, setAdminJwt] = useState(() => sessionStorage.getItem(ADMIN_JWT_KEY) ?? '');

  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [indexer, setIndexer] = useState<IndexerStatus | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMetadataResponse | null>(null);
  const [onChainDirect, setOnChainDirect] = useState<{ root: string; epoch: number } | null>(null);
  const [walletSample, setWalletSample] = useState<{ root?: string; epoch?: number; amount?: string } | null>(
    null,
  );
  const [rootSyncReport, setRootSyncReport] = useState<RootSyncReport | null>(null);

  const baseUrl = backendUrl.trim().replace(/\/$/, '');
  const master = jettonMaster.trim();
  const owner = (sampleOwner.trim() || walletAddress || '').trim();

  useEffect(() => {
    if (defaultBackendUrl) setBackendUrl(defaultBackendUrl);
  }, [defaultBackendUrl]);

  useEffect(() => {
    if (defaultMaster) setJettonMaster(defaultMaster);
  }, [defaultMaster]);

  useEffect(() => {
    sessionStorage.setItem(ADMIN_JWT_KEY, adminJwt);
  }, [adminJwt]);

  const groupedChecks = useMemo(() => {
    if (!compliance?.checks?.length) return [];
    const map = new Map<string, ComplianceCheck[]>();
    for (const c of compliance.checks) {
      const g = c.group || 'other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return [...map.entries()];
  }, [compliance]);

  const merkleSynced = useMemo(() => {
    if (diagnostics?.merkle_root_synced !== undefined) return diagnostics.merkle_root_synced;
    const off = diagnostics?.off_chain_merkle_root ?? compliance?.rolling?.merkle_root;
    const on = diagnostics?.on_chain_merkle_root ?? onChainDirect?.root;
    const eq = rootsEqual(off, on);
    return eq === null ? null : eq;
  }, [diagnostics, compliance, onChainDirect]);

  const refreshAll = useCallback(async () => {
    if (!baseUrl.startsWith('http')) {
      setHint('Укажите корректный URL бэкенда (https://…)');
      return;
    }
    if (!master) {
      setHint('Укажите Jetton Master (EQ…)');
      return;
    }

    setBusy(true);
    setHint('Загрузка…');
    setRootSyncReport(null);

    const errors: string[] = [];
    let resolvedOwner = owner;

    try {
      if (!resolvedOwner) {
        const batch = await fetchWalletsBatch(baseUrl, master, 3).catch(() => null);
        const first = batch?.wallets?.[0]?.owner;
        if (first) {
          resolvedOwner = first;
          setSampleOwner(first);
        }
      }

      const [diag, comp, idx, meta, chain, wallet] = await Promise.all([
        fetchDiagnostics(baseUrl).catch((e) => {
          errors.push(`diagnostics: ${(e as Error).message}`);
          return null;
        }),
        fetchCompliance(baseUrl, master, resolvedOwner || undefined).catch((e) => {
          errors.push(`compliance: ${(e as Error).message}`);
          return null;
        }),
        fetchIndexerStatus(baseUrl, master, resolvedOwner || undefined).catch((e) => {
          errors.push(`indexer: ${(e as Error).message}`);
          return null;
        }),
        fetchSyncMetadata(baseUrl, master, resolvedOwner || undefined).catch((e) => {
          errors.push(`sync-metadata: ${(e as Error).message}`);
          return null;
        }),
        fetchOnChainMerkleRoot(master).catch(() => null),
        resolvedOwner
          ? fetchWalletProofSample(baseUrl, master, resolvedOwner).catch(() => null)
          : Promise.resolve(null),
      ]);

      setDiagnostics(diag);
      setCompliance(comp);
      setIndexer(idx);
      setSyncMeta(meta);
      setOnChainDirect(chain);
      setWalletSample(wallet);
      setLastRefresh(new Date());

      if (errors.length) {
        setHint(errors.join(' · '));
      } else {
        setHint('');
      }
    } finally {
      setBusy(false);
    }
  }, [baseUrl, master, owner]);

  useEffect(() => {
    if (baseUrl.startsWith('http') && master) {
      void refreshAll();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initial load once

  const syncMerkleRoot = useCallback(async () => {
    if (!adminJwt.trim()) {
      setHint('Нужен ADMIN_JWT_SECRET (Bearer) для POST /admin/sync-merkle-root');
      return;
    }
    setBusy(true);
    setHint('Отправка update_merkle_root через бэкенд…');
    try {
      const report = await postSyncMerkleRoot(baseUrl, adminJwt);
      setRootSyncReport(report);
      setHint(
        report.synced
          ? `Merkle root синхронизирован (epoch ${report.on_chain?.epoch ?? report.broadcast_epoch ?? '—'})`
          : `Не синхронизировано: ${report.reason ?? 'unknown'}`,
      );
      await refreshAll();
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [adminJwt, baseUrl, refreshAll]);

  const sendMetadataTx = useCallback(
    async (kind: 'sync' | 'bump') => {
      if (!syncMeta) {
        setHint('Сначала обновите данные (sync-metadata не загружен)');
        return;
      }
      const tx = kind === 'bump' ? syncMeta.bumpMessage : syncMeta.message;
      if (!tx) {
        setHint(kind === 'bump' ? 'Bump не требуется или bumpMessage отсутствует' : 'message отсутствует');
        return;
      }
      setBusy(true);
      setHint('Подтвердите change_content в кошельке…');
      try {
        await sendTonConnectTx(tonConnectUI, tx);
        setHint('Транзакция metadata отправлена. Подождите 1–5 мин и обновите indexer-status.');
      } catch (e) {
        const msg = (e as Error).message;
        setHint(msg.includes('reject') || msg.includes('Rejected') ? 'Отменено в кошельке.' : msg);
      } finally {
        setBusy(false);
      }
    },
    [syncMeta, tonConnectUI],
  );

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Compliance &amp; диагностика (mintless API)</h2>
      <p style={{ opacity: 0.9 }}>
        Одна панель для проверки TEP-176/177 совместимости: merkle root on-chain vs off-chain, compliance score,
        Toncenter/TonAPI indexer, синхронизация root и metadata. Сеть: <b>{NETWORK}</b>
      </p>

      <label style={{ display: 'block', marginBottom: 12 }}>
        URL бэкенда RMJ
        <input
          style={{ width: '100%', marginTop: 6, padding: 8 }}
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          placeholder="https://your-backend.up.railway.app"
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        Jetton Master (EQ…)
        <input
          style={{ width: '100%', marginTop: 6, padding: 8 }}
          value={jettonMaster}
          onChange={(e) => setJettonMaster(e.target.value)}
          placeholder="EQ… — JETTON_MASTER_ADDRESS"
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        Sample owner (для wallet proof / indexer)
        <input
          style={{ width: '100%', marginTop: 6, padding: 8 }}
          value={sampleOwner}
          onChange={(e) => setSampleOwner(e.target.value)}
          placeholder="пусто = подключённый кошелёк"
        />
      </label>

      <label style={{ display: 'block', marginBottom: 16 }}>
        Admin JWT (<code>ADMIN_JWT_SECRET</code>, только в sessionStorage)
        <input
          style={{ width: '100%', marginTop: 6, padding: 8 }}
          type="password"
          value={adminJwt}
          onChange={(e) => setAdminJwt(e.target.value)}
          placeholder="Bearer token для sync-merkle-root"
          autoComplete="off"
        />
      </label>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <TonConnectButton />
        <button type="button" disabled={busy} onClick={() => void refreshAll()}>
          {busy ? 'Загрузка…' : 'Обновить всё'}
        </button>
        <button type="button" disabled={busy || !adminJwt.trim()} onClick={() => void syncMerkleRoot()}>
          Sync merkle root (admin)
        </button>
        <button
          type="button"
          disabled={busy || !syncMeta?.needsSync}
          onClick={() => void sendMetadataTx('sync')}
        >
          change_content (sync URI)
        </button>
        <button
          type="button"
          disabled={busy || !syncMeta?.needsBump || !syncMeta.bumpMessage}
          onClick={() => void sendMetadataTx('bump')}
        >
          change_content (bump ?v=)
        </button>
      </div>

      <p style={{ fontSize: 13, opacity: 0.8, wordBreak: 'break-all' }}>
        {walletAddress ? `Админ-кошелёк: ${walletAddress}` : 'Подключите кошелёк для change_content'}
        {lastRefresh ? ` · обновлено ${lastRefresh.toLocaleTimeString()}` : ''}
      </p>

      {/* Merkle root comparison */}
      <div style={panelStyle('#f8fafc', '#cbd5e1')}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Merkle root: on-chain vs off-chain</h3>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>Off-chain (DB / API)</td>
              <td style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {shortHex(diagnostics?.off_chain_merkle_root ?? compliance?.rolling?.merkle_root)}
                {diagnostics?.off_chain_db_epoch != null ? ` · epoch ${diagnostics.off_chain_db_epoch}` : ''}
                {compliance?.rolling?.tree_size != null ? ` · tree ${compliance.rolling.tree_size}` : ''}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>On-chain (diagnostics)</td>
              <td style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {shortHex(diagnostics?.on_chain_merkle_root)}
                {diagnostics?.on_chain_merkle_epoch != null ? ` · epoch ${diagnostics.on_chain_merkle_epoch}` : ''}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>On-chain (Toncenter direct)</td>
              <td style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {shortHex(onChainDirect?.root)}
                {onChainDirect != null ? ` · epoch ${onChainDirect.epoch}` : ''}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>Wallet API sample root</td>
              <td style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {walletSample ? (
                  <>
                    {shortHex(walletSample.root)} · epoch {walletSample.epoch ?? '—'}
                    {walletSample.amount ? ` · amount ${walletSample.amount}` : ''}
                  </>
                ) : (
                  '— (укажите owner)'
                )}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>Синхронизировано</td>
              <td style={{ color: statusColor(merkleSynced), fontWeight: 700 }}>
                {merkleSynced === true ? 'да' : merkleSynced === false ? 'НЕТ — Toncenter отклонит dump' : '—'}
              </td>
            </tr>
          </tbody>
        </table>
        {diagnostics?.integration_warnings?.length ? (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: '#b45309' }}>
            {diagnostics.integration_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {rootSyncReport && (
          <pre
            style={{
              marginTop: 10,
              fontSize: 11,
              background: '#0f172a',
              color: '#e2e8f0',
              padding: 10,
              borderRadius: 6,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(rootSyncReport, null, 2)}
          </pre>
        )}
      </div>

      {/* Compliance score */}
      {compliance && (
        <div
          style={panelStyle(
            compliance.score === compliance.total ? '#f0fdf4' : '#fff7ed',
            compliance.score === compliance.total ? '#86efac' : '#fdba74',
          )}
        >
          <h3 style={{ marginTop: 0, fontSize: 16 }}>
            Compliance: {compliance.score}/{compliance.total}
          </h3>
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>{compliance.summary}</p>
          {compliance.indexerHints?.recommendedAction && (
            <p style={{ fontSize: 13, color: '#b45309', margin: '0 0 12px' }}>
              Рекомендация: {compliance.indexerHints.recommendedAction}
            </p>
          )}
          {groupedChecks.map(([group, checks]) => (
            <div key={group} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                {GROUP_LABELS[group] ?? group}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {checks.map((c) => (
                  <li key={c.id} style={{ marginBottom: 4 }}>
                    <span style={{ color: statusColor(c.pass), fontWeight: 700 }}>{c.pass ? '✓' : '✗'}</span>{' '}
                    {c.label}
                    {c.note ? <span style={{ opacity: 0.75 }}> — {c.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Indexer status */}
      {indexer && (
        <div style={panelStyle('#eff6ff', '#93c5fd')}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>Indexer status (TonAPI / Toncenter)</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            <li>
              TonAPI:{' '}
              <span style={{ color: statusColor(indexer.tonapiWorks) }}>
                {indexer.tonapiWorks ? 'OK' : 'проблема'}
              </span>
            </li>
            <li>
              Toncenter:{' '}
              <span style={{ color: statusColor(indexer.toncenterWorks) }}>
                {indexer.toncenterWorks ? 'OK' : 'проблема'}
              </span>
            </li>
            <li>
              mintless_info indexed:{' '}
              <span style={{ color: statusColor(indexer.mintlessInfoIndexed) }}>
                {indexer.mintlessInfoIndexed ? 'да' : 'нет'}
              </span>
            </li>
            <li>
              cache stale:{' '}
              <span style={{ color: statusColor(!indexer.cacheStale) }}>
                {indexer.cacheStale ? 'да (нужен bump)' : 'нет'}
              </span>
            </li>
          </ul>
          <p style={{ fontSize: 13, margin: '10px 0 0' }}>
            <b>Действие:</b> {indexer.recommendedAction}
          </p>
          {indexer.supportMessage && (
            <p style={{ fontSize: 12, opacity: 0.8, margin: '8px 0 0' }}>{indexer.supportMessage}</p>
          )}
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>Toncenter cached URIs</summary>
            <pre style={{ fontSize: 11, overflow: 'auto' }}>
              {JSON.stringify(indexer.toncenterCached, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Sync metadata */}
      {syncMeta && (
        <div style={panelStyle('#faf5ff', '#d8b4fe')}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>Sync metadata (change_content)</h3>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>On-chain URI</td>
                <td style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>
                  {syncMeta.currentUri ?? '—'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>Target URI</td>
                <td style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>
                  {syncMeta.targetUri}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>needsSync</td>
                <td style={{ color: statusColor(!syncMeta.needsSync) }}>{syncMeta.needsSync ? 'да' : 'нет'}</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>needsBump</td>
                <td style={{ color: statusColor(!syncMeta.needsBump) }}>{syncMeta.needsBump ? 'да' : 'нет'}</td>
              </tr>
              {syncMeta.bumpTargetUri && (
                <tr>
                  <td style={{ padding: '4px 8px 4px 0', opacity: 0.75 }}>bump target</td>
                  <td style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>
                    {syncMeta.bumpTargetUri}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {syncMeta.rolling && (
            <p style={{ fontSize: 12, margin: '10px 0 0', opacity: 0.85 }}>
              Rolling epoch {syncMeta.rolling.epoch} · root {shortHex(syncMeta.rolling.merkle_root)}
              {syncMeta.rolling.note ? ` — ${syncMeta.rolling.note}` : ''}
            </p>
          )}
        </div>
      )}

      {/* Diagnostics raw */}
      {diagnostics && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 14 }}>Raw /api/v1/diagnostics</summary>
          <pre
            style={{
              marginTop: 8,
              background: '#0f172a',
              color: '#e2e8f0',
              padding: 12,
              borderRadius: 6,
              fontSize: 11,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(diagnostics, null, 2)}
          </pre>
        </details>
      )}

      {hint && (
        <div style={{ marginTop: 14, padding: 10, background: '#fef3c7', borderRadius: 8, fontSize: 14 }}>
          {hint}
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 13, opacity: 0.75 }}>
        Эндпоинты: <code>/api/v1/diagnostics</code>, <code>/api/v1/jettons/&#123;master&#125;/compliance</code>,{' '}
        <code>/indexer-status</code>, <code>/sync-metadata</code>, <code>POST /api/v1/admin/sync-merkle-root</code>
      </p>
    </section>
  );
}
