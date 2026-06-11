import { Address } from '@ton/core';
import { NETWORK } from './constants';

export type DiagnosticsResponse = {
  merkle_root_synced?: boolean;
  on_chain_merkle_root?: string | null;
  on_chain_merkle_epoch?: number | null;
  off_chain_merkle_root?: string;
  off_chain_db_epoch?: number;
  root_updates_will_send_onchain?: boolean;
  integration_warnings?: string[];
  epoch?: number;
  tree_size?: number;
};

export type ComplianceCheck = {
  id: string;
  group: string;
  label: string;
  pass: boolean;
  note?: string;
};

export type ComplianceReport = {
  score: number;
  total: number;
  summary: string;
  checks: ComplianceCheck[];
  rolling?: { epoch: number; merkle_root: string; tree_size: number };
  indexerHints?: { recommendedAction?: string };
};

export type IndexerStatus = {
  tonapiWorks: boolean;
  toncenterWorks: boolean;
  cacheStale: boolean;
  mintlessInfoIndexed: boolean;
  recommendedAction: string;
  toncenterCached: {
    customPayloadApiUri: string | null;
    mintlessMerkleDumpUri: string | null;
    metadataUri: string | null;
  };
  bumpTargetUri: string | null;
  supportMessage: string;
};

export type SyncMetadataResponse = {
  needsSync: boolean;
  needsBump: boolean;
  currentUri: string | null;
  targetUri: string;
  bumpTargetUri: string | null;
  mintlessInfoIndexed?: boolean;
  toncenterCacheStale?: boolean;
  rolling?: { epoch: number; merkle_root: string; note?: string };
  message: { address: string; amount: string; payload: string };
  bumpMessage?: { address: string; amount: string; payload: string } | null;
};

export type RootSyncReport = {
  synced: boolean;
  reason?: string;
  target_root?: string;
  on_chain?: { rootHex: string; epoch: number };
  broadcast_epoch?: number;
};

export type TonConnectTx = { address: string; amount: string; payload: string };

function apiBase(backendUrl: string): string {
  return backendUrl.trim().replace(/\/$/, '');
}

export function masterPathSegment(master: string): string {
  const testnet = NETWORK === 'testnet';
  return Address.parse(master.trim()).toString({
    urlSafe: true,
    bounceable: true,
    testOnly: testnet,
  });
}

export function ownerRawParam(owner: string): string {
  const a = Address.parse(owner.trim());
  return a.toRawString();
}

export async function fetchDiagnostics(backendUrl: string): Promise<DiagnosticsResponse> {
  const res = await fetch(`${apiBase(backendUrl)}/api/v1/diagnostics`);
  if (!res.ok) throw new Error(`diagnostics HTTP ${res.status}`);
  return res.json();
}

export async function fetchCompliance(
  backendUrl: string,
  master: string,
  owner?: string,
): Promise<ComplianceReport> {
  const seg = encodeURIComponent(masterPathSegment(master));
  const qs = owner?.trim() ? `?owner=${encodeURIComponent(ownerRawParam(owner))}` : '';
  const res = await fetch(`${apiBase(backendUrl)}/api/v1/jettons/${seg}/compliance${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `compliance HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchIndexerStatus(
  backendUrl: string,
  master: string,
  owner?: string,
): Promise<IndexerStatus> {
  const seg = encodeURIComponent(masterPathSegment(master));
  const qs = owner?.trim() ? `?owner=${encodeURIComponent(ownerRawParam(owner))}` : '';
  const res = await fetch(`${apiBase(backendUrl)}/api/v1/jettons/${seg}/indexer-status${qs}`);
  if (!res.ok) throw new Error(`indexer-status HTTP ${res.status}`);
  return res.json();
}

export async function fetchSyncMetadata(
  backendUrl: string,
  master: string,
  owner?: string,
): Promise<SyncMetadataResponse> {
  const seg = encodeURIComponent(masterPathSegment(master));
  const qs = owner?.trim() ? `?owner=${encodeURIComponent(ownerRawParam(owner))}` : '';
  const res = await fetch(`${apiBase(backendUrl)}/api/v1/jettons/${seg}/sync-metadata${qs}`);
  if (!res.ok) throw new Error(`sync-metadata HTTP ${res.status}`);
  return res.json();
}

export async function postSyncMerkleRoot(backendUrl: string, adminJwt: string): Promise<RootSyncReport> {
  const res = await fetch(`${apiBase(backendUrl)}/api/v1/admin/sync-merkle-root`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminJwt.trim()}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error((body as { reason?: string; error?: string }).reason ?? body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

export async function fetchOnChainMerkleRoot(master: string): Promise<{ root: string; epoch: number } | null> {
  const raw = Address.parse(master.trim()).toRawString();
  const base = NETWORK === 'testnet' ? 'https://testnet.toncenter.com/api/v3' : 'https://toncenter.com/api/v3';
  const res = await fetch(`${base}/runGetMethod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: raw,
      method: 'get_mintless_airdrop_hashmap_root',
      stack: [],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { stack?: { value?: string }[]; exit_code?: number };
  if (data.exit_code !== 0 && data.exit_code !== undefined) return null;
  const root = data.stack?.[0]?.value ?? '0x0';
  const epochHex = data.stack?.[1]?.value ?? '0x0';
  const epoch = Number.parseInt(epochHex.replace(/^0x/i, ''), 16) || 0;
  return { root, epoch };
}

export async function fetchWalletProofSample(
  backendUrl: string,
  master: string,
  owner: string,
): Promise<{ root?: string; epoch?: number; amount?: string } | null> {
  const seg = encodeURIComponent(masterPathSegment(master));
  const raw = ownerRawParam(owner);
  const res = await fetch(`${apiBase(backendUrl)}/api/v1/jettons/${seg}/wallet/${encodeURIComponent(raw)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    root?: string;
    epoch?: number;
    compressed_info?: { amount?: string };
  };
  return {
    root: body.root,
    epoch: body.epoch,
    amount: body.compressed_info?.amount,
  };
}
