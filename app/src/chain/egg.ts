import { Address, beginCell, Cell } from '@ton/core';
import { walletStateInit } from '@egg/sdk';
import { ton } from './client';

let code: Promise<Cell> | undefined;

/** The wallet code is read from the minter itself, so the app can never derive an address the chain disagrees with. */
function walletCode(master: Address): Promise<Cell> {
  code ??= ton()
    .runMethod(master, 'get_jetton_data')
    .then((r) => {
      r.stack.skip(4);
      return r.stack.readCell();
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

/** `get_wallet_address` is authoritative; the locally derived StateInit must agree with it before it is ever attached. */
export async function walletInit(master: Address, owner: Address) {
  const c = ton();
  const derived = walletStateInit(owner, master, await walletCode(master));
  const r = await c.runMethod(master, 'get_wallet_address', [{ type: 'slice', cell: beginCell().storeAddress(owner).endCell() }]);
  const onchain = r.stack.readAddress();
  if (!onchain.equals(derived.address)) throw new Error('wallet address mismatch');
  return derived;
}

export async function readEgg(master: Address, owner: Address): Promise<EggState> {
  const c = ton();
  const { address } = await walletInit(master, owner);
  if (!(await c.isContractDeployed(address))) return { jettonWallet: address, deployed: false, balance: 0n, claimed: 0n, lockedUntil: 0 };
  const wd = await c.runMethod(address, 'get_wallet_data');
  const balance = wd.stack.readBigNumber();
  const cs = await c.runMethod(address, 'get_claim_state');
  return { jettonWallet: address, deployed: true, balance, claimed: cs.stack.readBigNumber(), lockedUntil: Number(cs.stack.readBigNumber()) };
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
