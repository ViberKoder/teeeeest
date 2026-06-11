import { beginCell, Cell, contractAddress, Address } from '@ton/core';
import { customPayloadApiRoot, type PlannedDeploy } from './buildMaster';

/** Must match backend `MINTLESS_JETTON_METADATA_FILENAME`. */
export const MINTLESS_JETTON_METADATA_FILENAME = 'mintless-jetton-metadata.json';

export function fixedMintlessJettonMetadataUrl(publicBaseUrl: string): string {
  return `${publicBaseUrl.trim().replace(/\/$/, '')}/${MINTLESS_JETTON_METADATA_FILENAME}`;
}

/**
 * Merkle root of an empty TEP-177 Airdrop HashMap — matches `AirdropTree` with no leaves
 * (`beginCell().endCell().hash()`). Deploy with this when the tree is empty at launch.
 */
export const EMPTY_AIRDROP_MERKLE_ROOT =
  0x96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7n;

export interface BuildMintlessMasterParams {
  admin: Address;
  metadataUrl: string;
  /** Raw JettonWallet code BOC (before library reference wrapping). */
  walletCodeRawBase64: string;
  masterCodeBase64: string;
  /** Fixed at deploy — standard TEP-177 minter has no on-chain root update. */
  merkleRoot?: bigint;
}

/** ton-community/mintless-jetton: wallet code stored as library reference cell. */
export function jettonWalletCodeFromLibrary(jettonWalletCodeRaw: Cell): Cell {
  const libraryReferenceCell = beginCell()
    .storeUint(2, 8)
    .storeBuffer(jettonWalletCodeRaw.hash())
    .endCell();
  return new Cell({
    exotic: true,
    bits: libraryReferenceCell.bits,
    refs: libraryReferenceCell.refs,
  });
}

/** TEP-64 off-chain URI content (`storeStringRefTail`). */
export function jettonContentToCell(uri: string): Cell {
  return beginCell().storeStringRefTail(uri).endCell();
}

function minterDataCell(params: BuildMintlessMasterParams): Cell {
  const walletCodeRaw = Cell.fromBase64(params.walletCodeRawBase64);
  const walletCode = jettonWalletCodeFromLibrary(walletCodeRaw);
  const content = jettonContentToCell(params.metadataUrl);
  const merkleRoot = params.merkleRoot ?? EMPTY_AIRDROP_MERKLE_ROOT;

  return beginCell()
    .storeCoins(0n)
    .storeAddress(params.admin)
    .storeAddress(null)
    .storeUint(merkleRoot, 256)
    .storeRef(walletCode)
    .storeRef(content)
    .endCell();
}

export function buildMintlessDeploy(params: BuildMintlessMasterParams) {
  const code = Cell.fromBase64(params.masterCodeBase64);
  const data = minterDataCell(params);
  const init = { code, data };
  const address = contractAddress(0, init);
  const stateInit = beginCell()
    .storeUint(0, 2)
    .storeMaybeRef(code)
    .storeMaybeRef(data)
    .storeUint(0, 1)
    .endCell();
  return { address, stateInit, merkleRoot: params.merkleRoot ?? EMPTY_AIRDROP_MERKLE_ROOT };
}

export type PlannedMintlessDeploy = PlannedDeploy & { merkleRoot: bigint };

/**
 * Standard TEP-177 mintless master (ton-community/mintless-jetton).
 * Address is deterministic because on-chain metadata uses `{backend}/mintless-jetton-metadata.json`
 * (separate from RMJ `jetton-metadata2.json`).
 */
export function computePlannedMintlessDeploy(
  params: Omit<BuildMintlessMasterParams, 'metadataUrl'>,
  publicBaseUrl: string,
  testnet: boolean,
): PlannedMintlessDeploy {
  const metadataUrl = fixedMintlessJettonMetadataUrl(publicBaseUrl);
  const built = buildMintlessDeploy({ ...params, metadataUrl });
  return {
    metadataUrl,
    customPayloadApiUri: customPayloadApiRoot(publicBaseUrl, built.address, testnet),
    address: built.address,
    stateInit: built.stateInit,
    merkleRoot: built.merkleRoot,
  };
}
