import { Address, Cell } from '@ton/core';
import { eggWalletStateInit } from '@egg/contracts/wrappers/messages';
import { ton } from './client';

export interface JettonInfo {
  master: Address;
  walletCode: Cell;
  authority: bigint;
}

let info: Promise<JettonInfo> | undefined;

/** Everything needed to derive a user's jetton-wallet is read from the master itself. */
export function loadJetton(master: Address): Promise<JettonInfo> {
  info ??= (async () => {
    const c = ton();
    const data = await c.runMethod(master, 'get_jetton_data');
    data.stack.skip(4);
    const walletCode = data.stack.readCell();
    const auth = await c.runMethod(master, 'get_authority');
    return { master, walletCode, authority: auth.stack.readBigNumber() };
  })();
  return info;
}

export interface EggState {
  jettonWallet: Address;
  deployed: boolean;
  balance: bigint;
  claimed: bigint;
}

export async function readEgg(master: Address, owner: Address): Promise<EggState> {
  const c = ton();
  const j = await loadJetton(master);
  const { address } = eggWalletStateInit({ owner, master, walletCode: j.walletCode, authority: j.authority });
  const deployed = await c.isContractDeployed(address);
  if (!deployed) return { jettonWallet: address, deployed, balance: 0n, claimed: 0n };
  const wd = await c.runMethod(address, 'get_wallet_data');
  const balance = wd.stack.readBigNumber();
  const cs = await c.runMethod(address, 'get_claim_state');
  return { jettonWallet: address, deployed, balance, claimed: cs.stack.readBigNumber() };
}

export async function walletInit(master: Address, owner: Address) {
  const j = await loadJetton(master);
  return eggWalletStateInit({ owner, master, walletCode: j.walletCode, authority: j.authority });
}

