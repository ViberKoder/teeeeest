import { Address } from '@ton/core';
import { config } from './config';
import { fixedJettonMetadataUrl, jettonMasterFriendly } from './jettonAddressPath';
import {
  bumpMetadataUri,
  epochMetadataUri,
  metadataUriEpoch,
  metadataUriPathname,
  metadataUriStale,
} from './metadataUriUtils';
import { buildChangeContentBody } from './jettonContent';

export {
  bumpMetadataUri,
  epochMetadataUri,
  metadataUriPathname,
  metadataUriStale,
} from './metadataUriUtils';

export type ToncenterIndexerStatus = {
  network: 'mainnet' | 'testnet';
  onChainMaster: string;
  onChainMetadataUri: string | null;
  ourMetadataUri: string;
  toncenterCached: {
    metadataUri: string | null;
    customPayloadApiUri: string | null;
    mintlessMerkleDumpUri: string | null;
    isIndexed: boolean;
  };
  cacheStale: boolean;
  mintlessInfoIndexed: boolean;
  mintlessInfoSample: Record<string, unknown> | null;
  walletsIndexed: number;
  tonapiWorks: boolean;
  toncenterWorks: boolean;
  recommendedAction: 'wait' | 'bump_metadata_uri' | 'request_toncenter_indexing' | 'ready';
  bumpTargetUri: string | null;
  supportMessage: string;
};

function toncenterBase(network: 'mainnet' | 'testnet'): string {
  return network === 'testnet' ? 'https://testnet.toncenter.com/api/v3' : 'https://toncenter.com/api/v3';
}

function tonapiBase(network: 'mainnet' | 'testnet'): string {
  return network === 'testnet' ? 'https://testnet.tonapi.io/v2' : 'https://tonapi.io/v2';
}

function toncenterHeaders(): Record<string, string> {
  const key = config.TON_RPC_API_KEY?.trim();
  return key ? { 'X-API-Key': key } : {};
}

function includesMaster(value: string | null | undefined, master: Address): boolean {
  if (!value) return false;
  const raw = master.toRawString().toLowerCase();
  const hex = raw.split(':')[1] ?? '';
  const encoded = encodeURIComponent(raw).toLowerCase();
  const friendly = jettonMasterFriendly(master).toLowerCase();
  const v = value.toLowerCase();
  return v.includes(raw) || v.includes(encoded) || v.includes(hex) || v.includes(friendly);
}

function metadataRowForAddress(
  metadata: Record<string, unknown> | undefined,
  masterRaw: string,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const key = Object.keys(metadata).find((k) => k.toLowerCase() === masterRaw.toLowerCase());
  return key ? (metadata[key] as Record<string, unknown>) : null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { ...init });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function fixedRmjMetadataUri(publicAppUrl?: string): string {
  const base = (publicAppUrl ?? config.PUBLIC_APP_URL).trim().replace(/\/$/, '');
  return fixedJettonMetadataUrl(base);
}

/** RMJ master `change_content` (TEP-74 op 4) with off-chain URI cell. */
export function buildChangeContentPayload(metadataUri: string): string {
  return buildChangeContentBody(metadataUri).toBoc().toString('base64');
}

export async function getToncenterIndexerStatus(params: {
  network: 'mainnet' | 'testnet';
  onChainMaster: Address;
  ourMetadataUri?: string;
  /** Next epoch metadata bump target (RMJ rolling). Defaults to on-chain epoch + 1. */
  nextMetadataEpoch?: number;
  sampleOwnerAddress?: string | null;
}): Promise<ToncenterIndexerStatus> {
  const { network, onChainMaster, sampleOwnerAddress } = params;
  const masterRaw = onChainMaster.toRawString();
  const friendly = jettonMasterFriendly(onChainMaster);
  const ourMetadataUri = params.ourMetadataUri ?? fixedRmjMetadataUri();
  const headers = toncenterHeaders();

  const tcMaster = await fetchJson(`${toncenterBase(network)}/jetton/masters?address=${masterRaw}&limit=1`, {
    headers,
  });
  const masterRow = ((tcMaster?.jetton_masters as unknown[]) ?? [])[0] as
    | { jetton_content?: { uri?: string } }
    | undefined;
  const onChainMetadataUri = masterRow?.jetton_content?.uri ?? null;

  let metaRow = metadataRowForAddress(tcMaster?.metadata as Record<string, unknown> | undefined, masterRaw);
  if (!metaRow) {
    const tcMeta = await fetchJson(`${toncenterBase(network)}/metadata?address=${masterRaw}`, { headers });
    metaRow = tcMeta ? (Object.values(tcMeta)[0] as Record<string, unknown>) : null;
  }

  const token = ((metaRow?.token_info as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
  const extra = (token?.extra as Record<string, string>) ?? {};

  const toncenterCached = {
    metadataUri: extra.uri ?? null,
    customPayloadApiUri: extra.custom_payload_api_uri ?? null,
    mintlessMerkleDumpUri: extra.mintless_merkle_dump_uri ?? null,
    isIndexed: metaRow?.is_indexed === true,
  };

  const cacheStale =
    !includesMaster(toncenterCached.customPayloadApiUri, onChainMaster) ||
    !includesMaster(toncenterCached.mintlessMerkleDumpUri, onChainMaster) ||
    metadataUriStale(toncenterCached.metadataUri, onChainMetadataUri, ourMetadataUri);

  let mintlessInfoSample: Record<string, unknown> | null = null;
  let walletsIndexed = 0;
  if (sampleOwnerAddress) {
    const tcWallets = await fetchJson(
      `${toncenterBase(network)}/jetton/wallets?owner_address=${Address.parse(sampleOwnerAddress).toRawString()}&jetton_address=${masterRaw}&exclude_zero_balance=false`,
      { headers },
    );
    const rows = (tcWallets?.jetton_wallets as Record<string, unknown>[]) ?? [];
    walletsIndexed = rows.length;
    mintlessInfoSample = (rows[0]?.mintless_info as Record<string, unknown>) ?? null;
  }

  const allWallets = await fetchJson(
    `${toncenterBase(network)}/jetton/wallets?jetton_address=${masterRaw}&limit=5&exclude_zero_balance=false`,
    { headers },
  );
  const totalMintlessWallets = ((allWallets?.jetton_wallets as Record<string, unknown>[]) ?? []).filter(
    (row) => row.mintless_info,
  ).length;

  const taJetton = await fetchJson(`${tonapiBase(network)}/jettons/${friendly}`);
  const taMeta = (taJetton?.metadata as Record<string, string>) ?? {};
  const tonapiWorks = includesMaster(taMeta.custom_payload_api_uri, onChainMaster);

  const mintlessInfoIndexed = !!mintlessInfoSample?.amount || totalMintlessWallets > 0;
  const toncenterWorks = mintlessInfoIndexed && !cacheStale;

  let recommendedAction: ToncenterIndexerStatus['recommendedAction'] = 'ready';
  let bumpTargetUri: string | null = null;

  const bumpEpoch =
    params.nextMetadataEpoch ?? Math.max((metadataUriEpoch(onChainMetadataUri) ?? 0) + 1, 1);

  if (!mintlessInfoIndexed) {
    if (cacheStale) {
      recommendedAction = 'bump_metadata_uri';
      bumpTargetUri = epochMetadataUri(fixedRmjMetadataUri(), bumpEpoch);
    } else {
      recommendedAction = 'request_toncenter_indexing';
      bumpTargetUri = epochMetadataUri(fixedRmjMetadataUri(), bumpEpoch);
    }
  } else if (cacheStale) {
    recommendedAction = 'wait';
    bumpTargetUri = epochMetadataUri(fixedRmjMetadataUri(), bumpEpoch);
  }

  const apiRoot = config.PUBLIC_APP_URL.trim().replace(/\/$/, '');
  const masterPath = encodeURIComponent(friendly);
  const supportMessage = [
    'RMJ rolling mintless jetton indexing request',
    `Master: ${masterRaw}`,
    `Friendly: ${friendly}`,
    `On-chain metadata URI: ${onChainMetadataUri ?? ourMetadataUri}`,
    `Merkle dump: ${apiRoot}/api/v1/jettons/${masterPath}/merkle-dump.boc`,
    `Custom payload API: ${apiRoot}/api/v1/jettons/${masterPath}`,
    `Recipients: GET …/wallets?next_from=0:000…&count=100`,
    'Rolling mint: merkle root updates each epoch — indexers should refresh dump periodically.',
    'Please refresh metadata cache and index mintless_info for Tonscan / MyTonWallet.',
  ].join('\n');

  return {
    network,
    onChainMaster: masterRaw,
    onChainMetadataUri,
    ourMetadataUri,
    toncenterCached,
    cacheStale,
    mintlessInfoIndexed,
    mintlessInfoSample,
    walletsIndexed,
    tonapiWorks,
    toncenterWorks,
    recommendedAction,
    bumpTargetUri,
    supportMessage,
  };
}
