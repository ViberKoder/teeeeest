import { Address, beginCell, Cell, contractAddress, Dictionary, StateInit } from '@ton/core';
import { sha256_sync } from '@ton/crypto';

// ---------------------------------------------------------------- jetton-wallet

/** Initial data of a jetton-wallet — mirrors `WalletStorage` in storage.tolk. The address depends on nothing else. */
export function walletInitData(owner: Address, minter: Address): Cell {
  return beginCell()
    .storeCoins(0) // jettonBalance
    .storeAddress(owner)
    .storeAddress(minter)
    .storeCoins(0) // claimed
    .storeUint(0, 32) // claimLockedUntil
    .endCell();
}

export function walletStateInit(owner: Address, minter: Address, walletCode: Cell): { init: StateInit; address: Address } {
  const init: StateInit = { code: walletCode, data: walletInitData(owner, minter) };
  return { init, address: contractAddress(0, init) };
}

// ---------------------------------------------------------------- jetton-minter

export interface MinterConfig {
  maxSupply: bigint;
  admin: Address;
  /** ed25519 public key that signs roots */
  publisherKey: Buffer;
  metadata: Cell;
  /** most that may be newly promised per `periodSeconds` (default: the whole cap) */
  maxGrowth?: bigint;
  periodSeconds?: number;
}

/** Initial data of the minter — mirrors `MinterStorage` / `Governance` / `Keys` / `Limits`. */
export function minterInitData(c: MinterConfig): Cell {
  const governance = beginCell().storeAddress(c.admin).storeAddress(null).endCell();
  const keys = beginCell().storeBuffer(c.publisherKey, 32).storeUint(0, 256).storeCoins(0).endCell();
  const limits = beginCell()
    .storeCoins(c.maxGrowth ?? c.maxSupply)
    .storeUint(c.periodSeconds ?? 3600, 32)
    .storeUint(0, 32) // windowStart
    .storeCoins(0) // windowGrowth
    .storeCoins(0) // maxTotal
    .endCell();
  return beginCell()
    .storeCoins(0) // totalSupply
    .storeCoins(c.maxSupply)
    .storeRef(c.metadata)
    .storeRef(governance)
    .storeRef(keys)
    .storeRef(limits)
    .storeCoins(0) // totalMinted
    .storeUint(0, 64) // lastSeq
    .storeUint(0, 256) // lastRoot
    .endCell();
}

export function minterStateInit(c: MinterConfig, minterCode: Cell): { init: StateInit; address: Address } {
  const init: StateInit = { code: minterCode, data: minterInitData(c) };
  return { init, address: contractAddress(0, init) };
}

// ---------------------------------------------------------------- metadata

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  description?: string;
  /** https:// or ipfs:// URL */
  image?: string;
  /** optional off-chain JSON; explorers that prefer it will use it */
  uri?: string;
}

/**
 * TEP-64 *on-chain* content: name, symbol, decimals, description and image are stored in the
 * contract itself, so every explorer / wallet shows them without trusting a web server.
 */
export function onchainMetadata(m: TokenMetadata): Cell {
  const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
  const put = (k: string, v?: string) => {
    if (v) dict.set(BigInt('0x' + sha256_sync(k).toString('hex')), beginCell().storeUint(0, 8).storeStringTail(v).endCell());
  };
  put('name', m.name);
  put('symbol', m.symbol);
  put('decimals', String(m.decimals));
  put('description', m.description);
  put('image', m.image);
  put('uri', m.uri);
  return beginCell().storeUint(0, 8).storeDict(dict).endCell();
}
