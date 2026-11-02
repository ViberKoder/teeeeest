import { Address, beginCell, Cell } from '@ton/core';
import { walletStateInit } from '@egg/sdk';
import { ton } from './client';
import { runGetter } from './tonapi';

let code: Promise<Cell> | undefined;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/**
 * The wallet code is read from the minter itself, so the app can never derive an address the chain disagrees with.
 * The token has no upgrade path, so it is remembered on the device: afterwards no request is needed for it.
 */
function walletCode(master: Address): Promise<Cell> {
  const key = `egg.code.v1:${master.toRawString()}`;
  const cached = store.get(key);
  if (cached) {
    try {
      return Promise.resolve(Cell.fromBase64(cached));
    } catch {
      /* corrupted: fetch again */
    }
  }
  code ??= ton()
    .runMethod(master, 'get_jetton_data')
    .then((r) => {
      r.stack.skip(4);
      const c = r.stack.readCell();
      store.set(key, c.toBoc().toString('base64'));
      return c;
    });
  return code;
}

export interface EggState {
  jettonWallet: Address;
  deployed: boolean;
  balance: bigint;
  /** the largest cumulative amount this wallet has ever been credited */
  claimed: bigint;
  /** unix seconds until which a claim is in flight (0 = none) */
  lockedUntil: number;
}

/**
 * `get_wallet_address` is authoritative; the locally derived StateInit must agree with it before it is ever attached.
 * Once an (owner, minter) pair has been checked, the answer is remembered and the check is not repeated.
 */
export async function walletInit(master: Address, owner: Address) {
  const derived = walletStateInit(owner, master, await walletCode(master));
  const key = `egg.jw.v1:${master.toRawString()}:${owner.toRawString()}`;
  if (store.get(key) === derived.address.toRawString()) return derived;
  const r = await ton().runMethod(master, 'get_wallet_address', [{ type: 'slice', cell: beginCell().storeAddress(owner).endCell() }]);
  const onchain = r.stack.readAddress();
  if (!onchain.equals(derived.address)) throw new Error('wallet address mismatch');
  store.set(key, derived.address.toRawString());
  return derived;
}

/** Balance and claim state of the player's EGG wallet: two getters in parallel through TonAPI (toncenter keeps the TON balance). */
export async function readEgg(master: Address, owner: Address): Promise<EggState> {
  const { address } = await walletInit(master, owner);
  const raw = address.toRawString();
  const [wd, cs] = await Promise.all([runGetter(raw, 'get_wallet_data'), runGetter(raw, 'get_claim_state')]);
  if (!wd || !cs) return { jettonWallet: address, deployed: false, balance: 0n, claimed: 0n, lockedUntil: 0 };
  return { jettonWallet: address, deployed: true, balance: wd[0], claimed: cs[0], lockedUntil: Number(cs[1] ?? 0n) };
}

/** The commitment the minter stores for an epoch — the one thing a proof must open to. */
export async function onchainCommitment(master: Address, epoch: number): Promise<Buffer | null> {
  try {
    const r = await ton().runMethod(master, 'get_root', [{ type: 'int', value: BigInt(epoch) }]);
    return Buffer.from(r.stack.readBigNumber().toString(16).padStart(64, '0'), 'hex');
  } catch {
    return null;
  }
}
