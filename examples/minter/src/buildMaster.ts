import { beginCell, Cell, contractAddress, Address } from '@ton/core';

export interface BuildMasterParams {
  admin: Address;
  signerPubkeyHex: string;
  metadataUrl: string;
  walletCodeBase64: string;
  masterCodeBase64: string;
  maxSupplyNano?: bigint;
}

const OFFCHAIN_INLINE_URI_MAX = 126;
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

export function fixedJettonMetadataUrl(publicBaseUrl: string): string {
  return `${publicBaseUrl.trim().replace(/\/$/, '')}/jetton-metadata.json`;
}

export function jettonMasterDisplay(master: Address, testnet: boolean): string {
  return master.toString({ urlSafe: true, bounceable: true, testOnly: testnet });
}

export function customPayloadApiRoot(publicBaseUrl: string, master: Address, testnet: boolean): string {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  const seg = jettonMasterDisplay(master, testnet);
  return `${base}/api/v1/jettons/${seg}`;
}

export function mintlessMerkleDumpUrl(publicBaseUrl: string, master: Address, testnet: boolean): string {
  const base = publicBaseUrl.trim().replace(/\/$/, '');
  const seg = jettonMasterDisplay(master, testnet);
  return `${base}/api/v1/jettons/${seg}/merkle-dump.boc`;
}

export type PlannedDeploy = {
  /** Always `{backend}/jetton-metadata.json` — master is NOT in this URL. */
  metadataUrl: string;
  customPayloadApiUri: string;
  address: Address;
  stateInit: Cell;
};

/**
 * Master address is known before deploy because on-chain content uses a fixed metadata URL.
 * Set `JETTON_MASTER_ADDRESS` on the backend to this address before TonAPI indexes the jetton.
 */
export function computePlannedDeploy(
  params: Omit<BuildMasterParams, 'metadataUrl'>,
  publicBaseUrl: string,
  testnet: boolean,
): PlannedDeploy {
  const metadataUrl = fixedJettonMetadataUrl(publicBaseUrl);
  const built = buildDeploy({ ...params, metadataUrl });
  return {
    metadataUrl,
    customPayloadApiUri: customPayloadApiRoot(publicBaseUrl, built.address, testnet),
    address: built.address,
    stateInit: built.stateInit,
  };
}
