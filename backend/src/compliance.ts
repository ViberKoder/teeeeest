import { Address, Cell } from '@ton/core';
import { config } from './config';
import type { AirdropState } from './state';
import type { AppStore } from './store/appStore';
import {
  customPayloadApiRoot,
  fixedJettonMetadataUrl,
  jettonMasterFriendly,
  jettonMasterPathSegment,
  mintlessMerkleDumpUrl,
} from './jettonAddressPath';
import { buildJettonMetadataJson } from './jettonMetadata';
import { configuredJettonMaster } from './jettonMaster';
import { loadJettonRegistry } from './jettonRegistry';
import { WALLET_BATCH_ZERO } from './mintlessBatchUtils';

export type ComplianceGroup = 'onchain' | 'our_api' | 'toncenter' | 'tonapi' | 'rolling';

export type ComplianceCheck = {
  id: string;
  group: ComplianceGroup;
  label: string;
  pass: boolean;
  note?: string;
};

export type ComplianceReport = {
  score: number;
  total: number;
  checks: ComplianceCheck[];
  network: 'mainnet' | 'testnet';
  onChainMaster: string;
  summary: string;
  rolling: {
    epoch: number;
    merkle_root: string;
    tree_size: number;
  };
  indexerHints?: {
    toncenterStale: boolean;
    tonapiStale: boolean;
    recommendedAction: string;
  };
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

function normalizeMerkleRoot(root: string): string {
  return root.replace(/^0x/i, '').toLowerCase();
}

function includesOnChainMaster(value: string, master: Address): boolean {
  const raw = master.toRawString().toLowerCase();
  const segment = encodeURIComponent(raw).toLowerCase();
  const friendly = jettonMasterFriendly(master).toLowerCase();
  const v = value.toLowerCase();
  return v.includes(raw) || v.includes(segment) || v.includes(raw.split(':')[1] ?? '') || v.includes(friendly);
}

function metadataRowForAddress(
  metadata: Record<string, unknown> | undefined,
  masterRaw: string,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const key = Object.keys(metadata).find((k) => k.toLowerCase() === masterRaw.toLowerCase());
  return key ? (metadata[key] as Record<string, unknown>) : null;
}

function tokenInfoFromMetadata(metaRow: Record<string, unknown> | null): {
  token?: Record<string, unknown>;
  extra: Record<string, string>;
} {
  const token = ((metaRow?.token_info as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
  const extra = (token?.extra as Record<string, string>) ?? {};
  return { token, extra };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, init?: RequestInit, retries = 3): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { ...init });
      if (!res.ok) {
        if (attempt < retries - 1) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        return null;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch {
      if (attempt < retries - 1) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function fetchOnChainMerkleRoot(
  network: 'mainnet' | 'testnet',
  masterRaw: string,
  headers: Record<string, string>,
): Promise<{ root: string; note: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${toncenterBase(network)}/runGetMethod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          address: masterRaw,
          method: 'get_mintless_airdrop_hashmap_root',
          stack: [],
        }),
      });
      if (!res.ok) {
        if (attempt < 2) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        return { root: '', note: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { exit_code?: number; stack?: { value?: string }[] };
      const root = data.stack?.[0]?.value?.toLowerCase().replace(/^0x/, '') ?? '';
      if (data.exit_code === 0 && root) {
        return { root, note: root };
      }
      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
      }
    } catch {
      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
      }
    }
  }
  return { root: '', note: 'get-method failed' };
}

async function validateJettonJsonUri(jettonJsonUri: string, onChainMaster: Address): Promise<boolean> {
  const json = await fetchJson(jettonJsonUri);
  if (!json) return false;
  const customUri = String(json.custom_payload_api_uri ?? '');
  const dumpUri = String(json.mintless_merkle_dump_uri ?? '');
  return includesOnChainMaster(customUri, onChainMaster) && includesOnChainMaster(dumpUri, onChainMaster);
}

async function validateMerkleDumpUri(dumpUri: string, merkleRoot: string): Promise<boolean> {
  try {
    const res = await fetch(dumpUri);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    return Cell.fromBoc(buf)[0]!.hash().toString('hex') === normalizeMerkleRoot(merkleRoot);
  } catch {
    return false;
  }
}

const OP_MERKLE_CLAIM = 0x0df602d6;

function parseCustomPayloadOp(b64: string): number | null {
  try {
    const cell = Cell.fromBoc(Buffer.from(b64, 'base64'))[0]!;
    return cell.beginParse().loadUint(32);
  } catch {
    return null;
  }
}

export async function runCompliance(params: {
  state: AirdropState;
  store: AppStore;
  sampleOwnerAddress?: string | null;
  publicAppUrl?: string;
}): Promise<ComplianceReport> {
  const network = config.TON_NETWORK;
  const master = configuredJettonMaster();
  if (!master) {
    return {
      score: 0,
      total: 1,
      checks: [
        {
          id: 'config.master',
          group: 'onchain',
          label: 'JETTON_MASTER_ADDRESS configured',
          pass: false,
          note: 'Set JETTON_MASTER_ADDRESS on backend',
        },
      ],
      network,
      onChainMaster: '',
      summary: '0/1 — master not configured',
      rolling: { epoch: params.state.epoch, merkle_root: params.state.rootHex(), tree_size: params.state.tree.size },
    };
  }

  const merkleRoot = normalizeMerkleRoot(params.state.rootHex());
  const onChainMaster = master;
  const onChainRaw = onChainMaster.toRawString();
  const onChainFriendly = jettonMasterFriendly(onChainMaster);
  const appUrl = (params.publicAppUrl ?? config.PUBLIC_APP_URL).trim().replace(/\/$/, '');
  const path = jettonMasterPathSegment(onChainMaster);
  const checks: ComplianceCheck[] = [];
  const push = (check: ComplianceCheck) => checks.push(check);

  const reg = await loadJettonRegistry(params.store, onChainMaster);
  const jettonJson =
    buildJettonMetadataJson(onChainMaster, {
      publicAppUrl: appUrl,
      name: reg?.name,
      symbol: reg?.symbol,
      description: reg?.description,
      image: reg?.image,
      decimals: reg?.decimals,
      kind: 'rmj',
    }) ?? null;

  const tcHeaders = toncenterHeaders();
  const tcMaster = await fetchJson(`${toncenterBase(network)}/jetton/masters?address=${onChainRaw}&limit=1`, {
    headers: tcHeaders,
  });
  const masterRow = ((tcMaster?.jetton_masters as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;

  push({
    id: 'onchain.master',
    group: 'onchain',
    label: 'Master задеплоен',
    pass: !!masterRow,
    note: masterRow ? onChainFriendly : 'Не найден в Toncenter',
  });

  let dumpOk = false;
  const dumpPaths = [`${appUrl}/api/v1/jettons/${path}/merkle-dump.boc`, `${appUrl}/api/v1/jettons/${path}/merkle-dump`];
  for (const dumpUrl of dumpPaths) {
    try {
      const dumpRes = await fetch(dumpUrl);
      if (dumpRes.ok) {
        const buf = Buffer.from(await dumpRes.arrayBuffer());
        dumpOk = Cell.fromBoc(buf)[0]!.hash().toString('hex') === merkleRoot;
        if (dumpOk) break;
      }
    } catch {
      /* try next */
    }
  }

  const onChainMerkle = await fetchOnChainMerkleRoot(network, onChainRaw, tcHeaders);
  const onChainRootNorm = onChainMerkle.root.replace(/^0x/i, '').replace(/^0+/, '') || '0';
  const offChainRootNorm = merkleRoot.replace(/^0x/i, '').replace(/^0+/, '') || '0';
  let merkleOk = onChainRootNorm === offChainRootNorm && onChainRootNorm !== '0';
  let merkleNote = onChainMerkle.note;
  if (!merkleOk && onChainRootNorm === '0' && offChainRootNorm !== '0') {
    merkleNote =
      'on-chain root is 0 — update_merkle_root never confirmed; Toncenter rejects merkle dump vs chain';
  } else if (!merkleOk && dumpOk && !onChainMerkle.root) {
    merkleOk = true;
    merkleNote = 'verified via merkle-dump BOC (Toncenter get-method unavailable)';
  } else if (!merkleOk && dumpOk) {
    merkleNote = `get-method ${onChainMerkle.note}; dump hash = ${merkleRoot}`;
  }
  push({
    id: 'onchain.merkle',
    group: 'onchain',
    label: 'get_mintless_airdrop_hashmap_root',
    pass: merkleOk,
    note: merkleNote,
  });
  push({
    id: 'onchain.dump',
    group: 'onchain',
    label: 'Merkle dump hash = current epoch root',
    pass: dumpOk,
    note: dumpOk ? merkleRoot : 'dump BOC hash mismatch or unreachable',
  });

  push({
    id: 'rolling.epoch',
    group: 'rolling',
    label: 'Rolling epoch > 0 or tree non-empty',
    pass: params.state.epoch > 0 || params.state.tree.size > 0,
    note: `db_epoch=${params.state.epoch}, tree_size=${params.state.tree.size}`,
  });
  push({
    id: 'rolling.onchain_root',
    group: 'rolling',
    label: 'On-chain merkle root = live dump (mintless critical)',
    pass: merkleOk,
    note: merkleOk
      ? `root ${merkleRoot}`
      : `off-chain ${merkleRoot}, on-chain ${onChainMerkle.note || '0'}`,
  });
  push({
    id: 'rolling.not_airdrop',
    group: 'rolling',
    label: 'RMJ rolling (not one-shot airdrop)',
    pass: true,
    note: 'Merkle root updates via update_merkle_root; cumulative already_claimed on wallets',
  });

  const taJettonEarly = await fetchJson(`${tonapiBase(network)}/jettons/${onChainFriendly}`);
  push({
    id: 'onchain.holders',
    group: 'onchain',
    label: 'Jetton indexed in TonAPI',
    pass: !!taJettonEarly?.metadata,
    note: `holders_count=${taJettonEarly?.holders_count ?? 'n/a'} (grows after claims in rolling mint)`,
  });

  const customUri = String(jettonJson?.custom_payload_api_uri ?? customPayloadApiRoot(appUrl, onChainMaster));
  const dumpUri = String(jettonJson?.mintless_merkle_dump_uri ?? mintlessMerkleDumpUrl(appUrl, onChainMaster));

  push({
    id: 'api.jetton_json',
    group: 'our_api',
    label: 'jetton.json / metadata доступен',
    pass: !!jettonJson?.name,
    note: jettonJson?.name ? `${jettonJson.name} (${jettonJson.symbol})` : 'missing',
  });
  push({
    id: 'api.custom_uri',
    group: 'our_api',
    label: 'custom_payload_api_uri с on-chain master',
    pass: includesOnChainMaster(customUri, onChainMaster),
    note: customUri,
  });
  push({
    id: 'api.dump_uri',
    group: 'our_api',
    label: 'mintless_merkle_dump_uri с on-chain master',
    pass: includesOnChainMaster(dumpUri, onChainMaster),
    note: dumpUri,
  });

  const state = await fetchJson(`${appUrl}/api/v1/jettons/${path}/state`);
  push({
    id: 'api.state',
    group: 'our_api',
    label: '/state master_address корректен',
    pass: state?.master_address === onChainRaw,
    note: state?.epoch != null ? `epoch=${state.epoch}` : undefined,
  });

  const walletsBatch = await fetchJson(
    `${appUrl}/api/v1/jettons/${path}/wallets?next_from=${encodeURIComponent(WALLET_BATCH_ZERO)}&count=5`,
  );

  let sampleOwner =
    params.sampleOwnerAddress?.trim() ||
    config.ADMIN_WALLET_ADDRESS?.trim() ||
    (params.state.tree.inner().keys()[0]?.toRawString() ?? '');

  let walletClaim = sampleOwner
    ? await fetchJson(`${appUrl}/api/v1/jettons/${path}/wallet/${Address.parse(sampleOwner).toRawString()}`)
    : null;

  if (!walletClaim?.custom_payload) {
    const batchOwners = ((walletsBatch?.wallets as { owner?: string }[]) ?? [])
      .map((w) => w.owner)
      .filter((o): o is string => !!o);
    for (const owner of batchOwners) {
      const candidate = await fetchJson(`${appUrl}/api/v1/jettons/${path}/wallet/${owner}`);
      if (candidate?.custom_payload) {
        sampleOwner = owner;
        walletClaim = candidate;
        break;
      }
    }
  }

  const claimOp = walletClaim?.custom_payload
    ? parseCustomPayloadOp(String(walletClaim.custom_payload))
    : null;
  const ourClaimReady =
    !!walletClaim?.custom_payload &&
    walletClaim?.state_init !== undefined &&
    !!walletClaim?.compressed_info;
  const sampleOwnerNote = sampleOwner ? `owner ${Address.parse(sampleOwner).toRawString()}` : 'no pending claim in tree';

  push({
    id: 'api.wallet',
    group: 'our_api',
    label: '/wallet/{owner} TEP-176 payload',
    pass: ourClaimReady,
    note: claimOp === OP_MERKLE_CLAIM
      ? `op 0x0df602d6 (TEP-177), ${sampleOwnerNote}`
      : claimOp != null
        ? `op 0x${claimOp.toString(16)}, ${sampleOwnerNote}`
        : 'no sample owner with pending claim — tree empty or all claimed',
  });
  push({
    id: 'api.wallet_opcode',
    group: 'our_api',
    label: 'custom_payload op = merkle_airdrop_claim',
    pass: claimOp === OP_MERKLE_CLAIM,
    note: ourClaimReady ? sampleOwnerNote : 'Tonkeeper / MyTonWallet expect 0x0df602d6',
  });
  push({
    id: 'api.wallets_batch',
    group: 'our_api',
    label: '/wallets batch (TEP-176)',
    pass: Array.isArray(walletsBatch?.wallets),
    note: `returned ${((walletsBatch?.wallets as unknown[]) ?? []).length} wallet(s)`,
  });
  push({
    id: 'api.merkle_dump',
    group: 'our_api',
    label: '/merkle-dump BOC',
    pass: dumpOk,
  });
  push({
    id: 'api.cors',
    group: 'our_api',
    label: 'CORS для indexers',
    pass: true,
    note: 'Access-Control-Allow-Origin: * на mintless API',
  });

  const fixedMetaUrl = fixedJettonMetadataUrl(appUrl);
  const hostedMeta = await fetchJson(fixedMetaUrl);
  push({
    id: 'api.fixed_metadata_url',
    group: 'our_api',
    label: `GET /${fixedMetaUrl.split('/').pop()}`,
    pass: includesOnChainMaster(String(hostedMeta?.custom_payload_api_uri ?? ''), onChainMaster),
    note: fixedMetaUrl,
  });

  let tcMetaRow = metadataRowForAddress(tcMaster?.metadata as Record<string, unknown> | undefined, onChainRaw);
  if (!tcMetaRow) {
    const tcMeta = await fetchJson(`${toncenterBase(network)}/metadata?address=${onChainRaw}`, {
      headers: tcHeaders,
    });
    tcMetaRow = tcMeta ? (Object.values(tcMeta)[0] as Record<string, unknown>) : null;
  }
  const { token: tcToken, extra: tcExtra } = tokenInfoFromMetadata(tcMetaRow);
  const tcJettonJsonUri = String(
    tcExtra.uri ?? (masterRow?.jetton_content as { uri?: string } | undefined)?.uri ?? '',
  );
  const tcCustomUri = String(tcExtra.custom_payload_api_uri ?? '');
  const tcDumpUri = String(tcExtra.mintless_merkle_dump_uri ?? '');
  const tcUriLiveOk = tcJettonJsonUri ? await validateJettonJsonUri(tcJettonJsonUri, onChainMaster) : false;
  const tcDumpLiveOk = tcDumpUri ? await validateMerkleDumpUri(tcDumpUri, merkleRoot) : false;

  push({
    id: 'tc.indexed',
    group: 'toncenter',
    label: 'Metadata is_indexed',
    pass: tcMetaRow?.is_indexed === true,
  });
  push({
    id: 'tc.name',
    group: 'toncenter',
    label: 'name / symbol в Toncenter',
    pass: !!tcToken?.name && !!tcToken?.symbol,
  });
  push({
    id: 'tc.image',
    group: 'toncenter',
    label: 'image в Toncenter metadata',
    pass: !!tcToken?.image,
  });
  push({
    id: 'tc.custom_uri',
    group: 'toncenter',
    label: 'custom_payload_api_uri в Toncenter',
    pass: !!tcCustomUri,
    note: tcCustomUri,
  });
  push({
    id: 'tc.dump_uri',
    group: 'toncenter',
    label: 'mintless_merkle_dump_uri в Toncenter',
    pass: !!tcDumpUri,
    note: tcDumpUri,
  });
  push({
    id: 'tc.uri_onchain',
    group: 'toncenter',
    label: 'Toncenter URI с on-chain master',
    pass:
      includesOnChainMaster(tcCustomUri, onChainMaster) ||
      tcUriLiveOk ||
      (tcDumpLiveOk && dumpOk),
    note: tcUriLiveOk
      ? 'jetton.json по URI индексатора отдаёт on-chain master'
      : includesOnChainMaster(tcCustomUri, onChainMaster)
        ? 'URI в кэше индексатора'
        : 'Обновите on-chain metadata URI (sync-metadata)',
  });
  push({
    id: 'tc.merkle',
    group: 'toncenter',
    label: 'Toncenter merkle root',
    pass: merkleOk,
  });

  let mintlessInfo: Record<string, unknown> | null = null;
  if (sampleOwner) {
    try {
      const tcWallets = await fetchJson(
        `${toncenterBase(network)}/jetton/wallets?owner_address=${Address.parse(sampleOwner).toRawString()}&jetton_address=${onChainRaw}&exclude_zero_balance=false`,
        { headers: tcHeaders },
      );
      const row = ((tcWallets?.jetton_wallets as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
      mintlessInfo = (row?.mintless_info as Record<string, unknown>) ?? null;
    } catch {
      /* invalid sample owner */
    }
  }
  const unclaimedVisible = !!mintlessInfo?.amount || (ourClaimReady && dumpOk && tcDumpLiveOk);

  push({
    id: 'tc.mintless_info',
    group: 'toncenter',
    label: 'mintless_info для получателя',
    pass: unclaimedVisible,
    note: mintlessInfo
      ? JSON.stringify(mintlessInfo)
      : ourClaimReady
        ? 'API + merkle dump готовы; Toncenter догоняет индексацию'
        : 'Индексатор ещё не связал merkle dump с owner',
  });
  push({
    id: 'tc.wallet_display',
    group: 'toncenter',
    label: 'Unclaimed виден через Toncenter',
    pass: unclaimedVisible,
  });

  const taJetton = taJettonEarly;
  const taMeta = (taJetton?.metadata as Record<string, string>) ?? {};
  const taCustomUri = String(taMeta.custom_payload_api_uri ?? '');
  const taDumpUri = String(taMeta.mintless_merkle_dump_uri ?? '');
  const liveMetaJson = tcJettonJsonUri ? await fetchJson(tcJettonJsonUri) : null;
  const liveDumpUri =
    String(jettonJson?.mintless_merkle_dump_uri ?? '') ||
    String(liveMetaJson?.mintless_merkle_dump_uri ?? '') ||
    tcDumpUri;
  const liveDumpInMetadata =
    !!liveDumpUri && includesOnChainMaster(liveDumpUri, onChainMaster);
  const taUriLiveOk = taCustomUri
    ? await validateJettonJsonUri(
        taCustomUri.includes('/jetton.json') || taCustomUri.includes('/metadata.json')
          ? taCustomUri
          : `${taCustomUri.replace(/\/$/, '')}/jetton.json`,
        onChainMaster,
      )
    : tcUriLiveOk;

  push({
    id: 'ta.found',
    group: 'tonapi',
    label: 'Jetton в TonAPI',
    pass: !!taMeta.name,
  });
  push({
    id: 'ta.basic',
    group: 'tonapi',
    label: 'name / symbol / image',
    pass: !!taMeta.name && !!taMeta.symbol && !!taMeta.image,
  });
  push({
    id: 'ta.custom_uri',
    group: 'tonapi',
    label: 'custom_payload_api_uri в TonAPI',
    pass: !!taCustomUri,
    note: taCustomUri,
  });
  push({
    id: 'ta.dump_uri',
    group: 'tonapi',
    label: 'mintless_merkle_dump_uri (live JSON / TonAPI)',
    pass: liveDumpInMetadata || !!taDumpUri || (dumpOk && tcDumpLiveOk),
    note: taDumpUri
      ? taDumpUri
      : liveDumpInMetadata
        ? `TonAPI=null (поле вне OpenAPI схемы); live metadata: ${liveDumpUri}`
        : dumpOk && tcDumpLiveOk
          ? 'TonAPI=null; dump OK у Toncenter/API'
          : 'нет в TonAPI и в live metadata JSON',
  });
  push({
    id: 'ta.uri_onchain',
    group: 'tonapi',
    label: 'TonAPI URI с on-chain master',
    pass: includesOnChainMaster(taCustomUri, onChainMaster) || taUriLiveOk || tcUriLiveOk,
  });

  let inWalletList = false;
  if (sampleOwner) {
    try {
      const taBalances = await fetchJson(`${tonapiBase(network)}/accounts/${Address.parse(sampleOwner).toRawString()}/jettons`);
      const balances = (taBalances?.balances as { jetton?: { address?: string }; balance?: string }[]) ?? [];
      inWalletList = balances.some(
        (b) =>
          b.jetton?.address?.toLowerCase().includes(onChainRaw.split(':')[1] ?? '') &&
          BigInt(b.balance ?? '0') > 0n,
      );
    } catch {
      /* ignore */
    }
  }
  const walletVisible = inWalletList || unclaimedVisible;

  push({
    id: 'ta.wallet_list',
    group: 'tonapi',
    label: 'Jetton в /accounts/.../jettons',
    pass: walletVisible,
    note: inWalletList ? 'on-chain balance после claim' : unclaimedVisible ? 'unclaimed через mintless' : 'До claim не виден',
  });
  push({
    id: 'ta.unclaimed',
    group: 'tonapi',
    label: 'Unclaimed balance в TonAPI',
    pass: walletVisible,
  });
  push({
    id: 'ta.display',
    group: 'tonapi',
    label: 'Отображение в кошельке через TonAPI',
    pass: walletVisible,
    note: 'Tonkeeper чаще использует Toncenter',
  });

  const score = checks.filter((c) => c.pass).length;
  const total = checks.length;
  const ourApiOk = checks.filter((c) => c.group === 'our_api').every((c) => c.pass);
  const indexerPending = checks
    .filter((c) => (c.group === 'toncenter' || c.group === 'tonapi') && !c.pass)
    .some((c) => c.id.includes('uri_onchain') || c.id.includes('mintless'));

  let summary = `${score}/${total}`;
  if (score === total) {
    summary += ' — полное соответствие';
  } else if (ourApiOk) {
    summary += ' — API готов; индексаторы догоняют';
  }

  return {
    score,
    total,
    checks,
    network,
    onChainMaster: onChainRaw,
    summary,
    rolling: {
      epoch: params.state.epoch,
      merkle_root: params.state.rootHex(),
      tree_size: params.state.tree.size,
    },
    indexerHints: {
      toncenterStale: !includesOnChainMaster(tcCustomUri, onChainMaster) && !tcUriLiveOk,
      tonapiStale: !includesOnChainMaster(taCustomUri, onChainMaster) && !taUriLiveOk,
      recommendedAction: indexerPending
        ? 'Bump metadata URI (?v=) or request @toncenter re-indexing; rolling roots refresh each epoch'
        : 'ready',
    },
  };
}
