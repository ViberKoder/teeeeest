import {
  Address,
  beginCell,
  Cell,
  Dictionary,
  DictionaryValue,
  Slice,
  Builder,
  DictionaryKey,
  toNano,
} from '@ton/core';

/**
 * Represents a single user's cumulative reward entry in the Airdrop HashMap.
 *
 * The hashmap is keyed by the user's TON address packed into a 267-bit
 * unsigned integer (matching TEP-177's `HashMap 267 AirdropItem`). The
 * value carries the **cumulative** amount of jetton ever earned by the
 * user, plus optional validity window.
 *
 * For rolling updates the tree builder keeps one logical entry per user
 * and monotonically increases `cumulativeAmount` each epoch.
 */
export interface AirdropItem {
  /** Cumulative jettons earned since genesis (in nano units). */
  cumulativeAmount: bigint;
  /** Unix seconds at which claims become valid (0 for always). */
  startFrom: number;
  /** Unix seconds after which claims are rejected. */
  expiredAt: number;
}

export const AirdropItemValue: DictionaryValue<AirdropItem> = {
  serialize(src: AirdropItem, builder: Builder) {
    builder
      .storeCoins(src.cumulativeAmount)
      .storeUint(src.startFrom, 48)
      .storeUint(src.expiredAt, 48);
  },
  parse(src: Slice): AirdropItem {
    const cumulativeAmount = src.loadCoins();
    const startFrom = src.loadUint(48);
    const expiredAt = src.loadUint(48);
    return { cumulativeAmount, startFrom, expiredAt };
  },
};

/**
 * Convert a TON address into the 267-bit unsigned integer key used by
 * TEP-177's `HashMap 267 AirdropItem`.
 */
export function addressToKey267(addr: Address): bigint {
  const cell = beginCell().storeAddress(addr).endCell();
  const slice = cell.beginParse();
  return slice.loadUintBig(267);
}

/**
 * Dictionary key type for the Airdrop HashMap. Keyed by raw TON Address —
 * matches TEP-177's `HashMap 267 AirdropItem`. @ton/core serializes the
 * address as its canonical MsgAddress bit-layout, producing a 267-bit key.
 */
export const Key267: DictionaryKey<Address> = Dictionary.Keys.Address();

/**
 * Thin builder around @ton/core's Dictionary that tracks users' cumulative
 * balances and can produce Merkle proofs compatible with the on-chain
 * verifier.
 *
 * Usage:
 *   const tree = new AirdropTree();
 *   tree.set(userAddr, { cumulativeAmount: 100n, startFrom: 0, expiredAt: 1e10 });
 *   const root = tree.root();
 *   const proofCell = tree.generateProof(userAddr);
 */
export class AirdropTree {
  private dict: Dictionary<Address, AirdropItem>;

  constructor(existing?: Dictionary<Address, AirdropItem>) {
    this.dict = existing ?? Dictionary.empty(Key267, AirdropItemValue);
  }

  static fromCell(cell: Cell): AirdropTree {
    const dict = Dictionary.loadDirect(Key267, AirdropItemValue, cell.beginParse());
    return new AirdropTree(dict);
  }

  set(address: Address, item: AirdropItem): void {
    this.dict.set(address, item);
  }

  get(address: Address): AirdropItem | undefined {
    return this.dict.get(address);
  }

  has(address: Address): boolean {
    return this.dict.has(address);
  }

  /** Number of leaves. */
  get size(): number {
    return this.dict.size;
  }

  /** Serialize the HashMap into a single cell (suitable for on-chain hashing). */
  toCell(): Cell {
    if (this.dict.size === 0) {
      // Empty dict — return an empty cell to produce a stable zero-ish root.
      return beginCell().endCell();
    }
    return beginCell().storeDictDirect(this.dict).endCell();
  }

  /** Root hash of the HashMap — matches on-chain `merkle_root`. */
  root(): bigint {
    return BigInt('0x' + this.toCell().hash().toString('hex'));
  }

  rootBuffer(): Buffer {
    return this.toCell().hash();
  }

  /** Number of leaves in the tree (0 when empty). */
  isEmpty(): boolean {
    return this.dict.size === 0;
  }

  /**
   * Generate a Merkle proof that commits to this user's AirdropItem against
   * the current tree root. The returned cell is an EXOTIC merkle-proof cell
   * ready to be attached as the inner ref of `rolling_claim` custom payload.
   */
  generateProof(address: Address): Cell {
    if (!this.dict.has(address)) {
      throw new Error(`AirdropTree: address ${address.toString()} not present`);
    }
    return this.dict.generateMerkleProof([address]);
  }

  /** Return the underlying Dictionary instance (for advanced callers). */
  inner(): Dictionary<Address, AirdropItem> {
    return this.dict;
  }
}

/**
 * Convenience helper used in tests and in the Proof API.
 */
export function itemFromBigint(cumulative: bigint | number): AirdropItem {
  return {
    cumulativeAmount: typeof cumulative === 'bigint' ? cumulative : BigInt(cumulative),
    startFrom: 0,
    expiredAt: 2 ** 47 - 1,
  };
}

/**
 * Convert a human jetton amount (e.g. "1.5") into nano units assuming 9 decimals.
 */
export function jettons(amount: string | number | bigint): bigint {
  if (typeof amount === 'bigint') return amount;
  return toNano(typeof amount === 'number' ? amount.toString() : amount);
}
