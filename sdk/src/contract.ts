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
  publisher: Address;
  metadata: Cell;
  /** most that may be newly promised per `periodSeconds` (default: the whole cap) */
  maxGrowth?: bigint;
  periodSeconds?: number;
  /** minimum seconds between two published roots */
  minInterval?: number;
}

/** Initial data of the minter — mirrors `MinterStorage` / `Governance` / `Limits`. */
export function minterInitData(c: MinterConfig): Cell {
  const governance = beginCell().storeAddress(c.admin).storeAddress(null).storeAddress(c.publisher).endCell();
  const limits = beginCell()
    .storeCoins(c.maxGrowth ?? c.maxSupply)
    .storeUint(c.periodSeconds ?? 3600, 32)
    .storeUint(c.minInterval ?? 0, 32)
    .storeUint(0, 32) // windowStart
    .storeCoins(0) // windowGrowth
    .storeUint(0, 32) // lastPublishedAt
    .storeCoins(0) // lastTotal
    .endCell();
  return beginCell()
    .storeCoins(0) // totalSupply
    .storeCoins(c.maxSupply)
    .storeUint(0, 32) // lastEpoch
    .storeRef(c.metadata)
    .storeBit(0) // roots: empty map
    .storeRef(governance)
    .storeRef(limits)
    .storeCoins(0) // totalMinted
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
