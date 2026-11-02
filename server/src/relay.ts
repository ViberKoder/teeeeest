import { Address, Cell, loadMessageRelaxed } from '@ton/core';
import { Op, SUBWALLET_ID, tgWalletStateInit, walletStateInit, eggWalletCode } from '@egg/sdk';

export type RelayRefusal =
  | 'bad-request' | 'not-a-send-request' | 'wrong-wallet' | 'expired' | 'not-a-claim' | 'too-much-value' | 'wrong-subwallet';

export interface RelayCheck {
  minter: Address;
  network: 'testnet' | 'mainnet';
  maxForward: bigint;
  now: number;
}

const SEND_ONE_INTERNAL = 0x63896e74;

/**
 * A relayer pays real TON, so it only ever forwards ONE thing: the player's own request to hatch.
 * Everything is re-derived here — the wallet address from the public key, the player's jetton-wallet from
 * that address — so a request can not make the relayer fund anything else.
 */
export function checkRelayRequest(
  requestBoc: Buffer,
  publicKey: Buffer,
  linkedAddress: string,
  c: RelayCheck,
): { ok: true; body: Cell; wallet: Address; init: ReturnType<typeof tgWalletStateInit>['init'] } | { ok: false; reason: RelayRefusal } {
  let body: Cell;
  try {
    body = Cell.fromBoc(requestBoc)[0];
  } catch {
    return { ok: false, reason: 'bad-request' };
  }
  const subwalletId = SUBWALLET_ID[c.network];
  const { init, address: wallet } = tgWalletStateInit({ publicKey, subwalletId });
  if (wallet.toRawString() !== linkedAddress) return { ok: false, reason: 'wrong-wallet' };

  try {
    const s = body.beginParse();
    s.skip(512); // signature: verified by the wallet contract itself
    if (s.loadUint(32) !== SEND_ONE_INTERNAL) return { ok: false, reason: 'not-a-send-request' };
    if (s.loadUint(32) !== subwalletId) return { ok: false, reason: 'wrong-subwallet' };
    const validUntil = s.loadUint(32);
    if (validUntil <= c.now || validUntil > c.now + 3600) return { ok: false, reason: 'expired' };
    s.skip(32 + 8); // seqno, send mode
    const msg = loadMessageRelaxed(s.loadRef().beginParse());
    if (msg.info.type !== 'internal') return { ok: false, reason: 'not-a-claim' };

    const expectedEggWallet = walletStateInit(wallet, c.minter, eggWalletCode).address;
    if (!msg.info.dest.equals(expectedEggWallet)) return { ok: false, reason: 'not-a-claim' };
    if (msg.body.beginParse().loadUint(32) !== Op.askToClaim) return { ok: false, reason: 'not-a-claim' };
    if (msg.info.value.coins > c.maxForward) return { ok: false, reason: 'too-much-value' };
  } catch {
    return { ok: false, reason: 'bad-request' };
  }
  return { ok: true, body, wallet, init };
}
