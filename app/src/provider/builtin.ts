import { internal, SendMode, toNano, WalletContractV5R1 } from '@ton/ton';
import { KeyPair, mnemonicToPrivateKey } from '@ton/crypto';
import { cfg } from '../config';
import { ton } from '../chain/client';
import type { OutMessage, WalletProvider } from './types';

/** Self-custody wallet v5r1. Keys exist only while the app is unlocked. */
export class BuiltinProvider implements WalletProvider {
  readonly kind = 'builtin' as const;
  private keys?: KeyPair;
  private readonly wallet: WalletContractV5R1;

  private constructor(keys: KeyPair) {
    this.keys = keys;
    this.wallet = WalletContractV5R1.create({
      workchain: 0,
      publicKey: keys.publicKey,
      walletId: { networkGlobalId: cfg.network === 'testnet' ? -3 : -239 },
    });
  }

  static async fromMnemonic(words: string[]) {
    return new BuiltinProvider(await mnemonicToPrivateKey(words));
  }

  get address() {
    return this.wallet.address;
  }

  lock() {
    this.keys?.secretKey.fill(0);
    this.keys = undefined;
  }

  async send(messages: OutMessage[]) {
    if (!this.keys) throw new Error('Wallet is locked');
    const c = ton().open(this.wallet);
    const seqno = await c.getSeqno();
    await c.sendTransfer({
      seqno,
      secretKey: this.keys.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
      messages: messages.map((m) => internal({ to: m.to, value: m.value, bounce: m.bounce, body: m.body, init: m.init })),
      timeout: Math.floor(Date.now() / 1000) + 300,
    });
  }
}

export const MIN_TON_RESERVE = toNano('0.05');
