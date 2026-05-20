import { beginCell, Cell, contractAddress, Address } from '@ton/core';

export interface BuildMasterParams {
  admin: Address;
  signerPubkeyHex: string;
  metadataUrl: string;
  walletCodeBase64: string;
  masterCodeBase64: string;
  /** 0n = unlimited admin mint on-chain; otherwise master rejects mints above this cap. */
  maxSupplyNano?: bigint;
}

/** Макс. байт UTF-8, которые помещаются в одну ячейку после префикса 0x01 (1023−8 бит). */
const OFFCHAIN_INLINE_URI_MAX = 126;
/** Макс. байт данных в одном звене snake (без префикса 0x01 в этом звене). */
const SNAKE_CHUNK = 127;

/**
 * TEP-64 off-chain: для короткого URI — `0x01 || uri`.
 * Длиннее OFFCHAIN_INLINE_URI_MAX — snake в ref: `0x01 || ref(snake(uri))`.
 */
function buildSnakeFromBuffer(data: Buffer): Cell {
  const chunks: Buffer[] = [];
  for (let i = 0; i < data.length; i += SNAKE_CHUNK) {
    chunks.push(data.subarray(i, Math.min(i + SNAKE_CHUNK, data.length)));
  }
  let cell = beginCell().storeBuffer(chunks[chunks.length - 1]).endCell();
  for (let i = chunks.length - 2; i >= 0; i--) {
    cell = beginCell().storeBuffer(chunks[i]).storeRef(cell).endCell();
  }
  return cell;
}

function toOffchainContentCell(url: string): Cell {
  const bytes = Buffer.from(url, 'utf8');
  if (bytes.length <= OFFCHAIN_INLINE_URI_MAX) {
    return beginCell().storeUint(0x01, 8).storeBuffer(bytes).endCell();
  }
  const snake = buildSnakeFromBuffer(bytes);
  return beginCell().storeUint(0x01, 8).storeRef(snake).endCell();
}

function masterDataCell(params: BuildMasterParams): Cell {
  const walletCode = Cell.fromBase64(params.walletCodeBase64);
  const content = toOffchainContentCell(params.metadataUrl);
  const signerPubkey = BigInt(`0x${params.signerPubkeyHex}`);

  const rolling = beginCell()
    .storeUint(0n, 256) // merkle_root
    .storeUint(0, 32) // epoch
    .storeUint(signerPubkey, 256)
    .storeUint(0, 1) // is_paused
    .endCell();

  return beginCell()
    .storeCoins(0n) // total_supply
    .storeCoins(params.maxSupplyNano ?? 0n) // max_supply (0 = unlimited)
    .storeAddress(params.admin)
    .storeRef(content)
    .storeRef(walletCode)
    .storeRef(rolling)
    .endCell();
}

export function buildDeploy(params: BuildMasterParams) {
  const code = Cell.fromBase64(params.masterCodeBase64);
  const data = masterDataCell(params);
  const init = { code, data };
  const address = contractAddress(0, init);
  const stateInit = beginCell()
    .storeUint(0, 2)
    .storeMaybeRef(code)
    .storeMaybeRef(data)
    .storeUint(0, 1)
    .endCell();
  return { address, stateInit };
}

/** EQ… segment for URLs (TonAPI / Tonkeeper style). */
export function jettonMasterSegment(master: Address, testnet: boolean): string {
  return master.toString({ urlSafe: true, bounceable: true, testOnly: testnet });
}

/** Placeholder EQ… for the metadata URL → address fixed-point (URL embeds final master). */
const METADATA_URL_PLACEHOLDER =
  'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

/**
 * TEP-64 off-chain content URL must include the jetton master so the first fetch
 * already exposes the correct `custom_payload_api_uri` (…/api/v1/jettons/{master}).
 */
export function jettonMetadataHostedUrl(publicBaseUrl: string, master: Address, testnet: boolean): string {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterSegment(master, testnet)}/metadata.json`;
}

/** Final API root for TEP offchain-payloads (`GET …/wallet/0:owner`). */
export function customPayloadApiRoot(publicBaseUrl: string, master: Address, testnet: boolean): string {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterSegment(master, testnet)}`;
}

export type PlannedDeploy = {
  metadataUrl: string;
  customPayloadApiUri: string;
  address: Address;
  stateInit: Cell;
};

/**
 * Compute jetton master address **before** deploy. On-chain `content` will point at
 * `metadataUrl`; that JSON (on your backend) must expose `custom_payload_api_uri`
 * with the same master — iteration accounts for URL length changing the address.
 */
export function computePlannedDeploy(
  params: Omit<BuildMasterParams, 'metadataUrl'>,
  publicBaseUrl: string,
  testnet: boolean,
): PlannedDeploy {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  let metadataUrl = `${base}/api/v1/jettons/${METADATA_URL_PLACEHOLDER}/metadata.json`;
  let prevAddress: Address | null = null;

  for (let i = 0; i < 6; i++) {
    const built = buildDeploy({ ...params, metadataUrl });
    const nextUrl = jettonMetadataHostedUrl(base, built.address, testnet);
    if (prevAddress?.equals(built.address) && metadataUrl === nextUrl) {
      return {
        metadataUrl: nextUrl,
        customPayloadApiUri: customPayloadApiRoot(base, built.address, testnet),
        address: built.address,
        stateInit: built.stateInit,
      };
    }
    prevAddress = built.address;
    metadataUrl = nextUrl;
  }

  const built = buildDeploy({ ...params, metadataUrl });
  return {
    metadataUrl,
    customPayloadApiUri: customPayloadApiRoot(base, built.address, testnet),
    address: built.address,
    stateInit: built.stateInit,
  };
}

/** @deprecated Use computePlannedDeploy */
export const resolveDeployWithMetadataUrl = computePlannedDeploy;

