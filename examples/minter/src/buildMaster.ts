import { beginCell, Cell, contractAddress, Address } from '@ton/core';

export interface BuildMasterParams {
  admin: Address;
  signerPubkeyHex: string;
  metadataUrl: string;
  walletCodeBase64: string;
  masterCodeBase64: string;
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

