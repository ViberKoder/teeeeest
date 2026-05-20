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
    .storeUint(0n, 256)
    .storeUint(0, 32)
    .storeUint(signerPubkey, 256)
    .storeUint(0, 1)
    .endCell();

  return beginCell()
    .storeCoins(0n)
    .storeCoins(params.maxSupplyNano ?? 0n)
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

/** Canonical `0:…` in URL paths (TEP offchain-payloads). */
export function jettonMasterPathSegment(master: Address): string {
  return encodeURIComponent(master.toRawString());
}

export function parseJettonMasterPathSegment(param: string): Address | null {
  try {
    return Address.parse(decodeURIComponent(param.trim()));
  } catch {
    return null;
  }
}

const PLACEHOLDER_RAW = encodeURIComponent(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
);

export function jettonMetadataHostedUrl(publicBaseUrl: string, master: Address): string {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterPathSegment(master)}/metadata.json`;
}

export function customPayloadApiRoot(publicBaseUrl: string, master: Address): string {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  return `${base}/api/v1/jettons/${jettonMasterPathSegment(master)}`;
}

/** EQ/UQ display for Tonkeeper / explorers */
export function jettonMasterDisplay(master: Address, testnet: boolean): string {
  return master.toString({ urlSafe: true, bounceable: true, testOnly: testnet });
}

export type PlannedDeploy = {
  metadataUrl: string;
  customPayloadApiUri: string;
  address: Address;
  stateInit: Cell;
  converged: boolean;
};

/**
 * Fixed-point: on-chain metadata URL must reference the same master address as the contract.
 * Uses raw `0:…` in the path so URI and deploy address cannot drift across EQ variants.
 */
export function computePlannedDeploy(
  params: Omit<BuildMasterParams, 'metadataUrl'>,
  publicBaseUrl: string,
): PlannedDeploy {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  let metadataUrl = `${base}/api/v1/jettons/${PLACEHOLDER_RAW}/metadata.json`;

  for (let i = 0; i < 24; i++) {
    const built = buildDeploy({ ...params, metadataUrl });
    const nextUrl = jettonMetadataHostedUrl(base, built.address);
    const apiRoot = customPayloadApiRoot(base, built.address);

    if (metadataUrl === nextUrl) {
      const fromUrl = parseJettonMasterPathSegment(
        nextUrl.replace(/.*\/jettons\//, '').replace(/\/metadata\.json$/, ''),
      );
      if (!fromUrl?.equals(built.address)) {
        throw new Error('internal: metadata URL master mismatch after convergence');
      }
      return {
        metadataUrl: nextUrl,
        customPayloadApiUri: apiRoot,
        address: built.address,
        stateInit: built.stateInit,
        converged: true,
      };
    }
    metadataUrl = nextUrl;
  }

  const built = buildDeploy({ ...params, metadataUrl });
  const fixedUrl = jettonMetadataHostedUrl(base, built.address);
  const fixedRoot = customPayloadApiRoot(base, built.address);
  const converged = fixedUrl === metadataUrl;

  if (!converged) {
    throw new Error(
      `metadata URL did not converge for this master (on-chain content would not match deploy address). ` +
        `Try slightly different token name/symbol or backend URL. ` +
        `Deploy address ${built.address.toRawString()}, URL would need ${fixedUrl}`,
    );
  }

  return {
    metadataUrl: fixedUrl,
    customPayloadApiUri: fixedRoot,
    address: built.address,
    stateInit: buildDeploy({ ...params, metadataUrl: fixedUrl }).stateInit,
    converged: true,
  };
}
