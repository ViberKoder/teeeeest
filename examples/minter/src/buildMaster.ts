import { beginCell, Cell, contractAddress, Address } from '@ton/core';

export interface BuildMasterParams {
  admin: Address;
  signerPubkeyHex: string;
  metadataUrl: string;
  walletCodeBase64: string;
  masterCodeBase64: string;
}

function toOffchainContentCell(url: string): Cell {
  // TEP-64 off-chain content marker = 0x01 + utf8 url
  const bytes = Buffer.from(url, 'utf8');
  return beginCell().storeUint(0x01, 8).storeBuffer(bytes).endCell();
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

