import { Address, SendMode, toNano } from '@ton/core';
import { KeyPair, mnemonicToPrivateKey } from '@ton/crypto';
import { changeKey, externalBoc, SUBWALLET_ID, sendOne, tgWalletStateInit } from '@egg/sdk';
import { api, ApiError } from '../api/server';
import { ton } from '../chain/client';
import { cfg } from '../config';
import type { OutMessage, WalletProvider } from './types';

/** TON a request needs on the wallet itself to pay its own way (the forwarded value plus the wallet's gas). */
const GAS_MARGIN = toNano('0.02');
const TTL = 600;

export class NeedTonError extends Error {
  constructor() {
    super('need-ton');
  }
}

/**
 * The player's wallet: Telegram's WalletTg contract, keyed from a phrase that belongs to the Telegram account.
 * Requests are signed on the device. With TON on the wallet they are sent as ordinary (external) messages; a brand-new
 * player with none can hatch their first EGG through the server's gasless relay.
 */
export class TgWalletProvider implements WalletProvider {
  readonly address: Address;
  private keys: KeyPair;
  private readonly subwalletId: number;
  private readonly walletInit: ReturnType<typeof tgWalletStateInit>['init'];

  private constructor(keys: KeyPair) {
    this.keys = keys;
    this.subwalletId = SUBWALLET_ID[cfg.network];
    const { init, address } = tgWalletStateInit({ publicKey: keys.publicKey, subwalletId: this.subwalletId });
    this.walletInit = init;
    this.address = address;
  }

  static async fromWords(words: string[]) {
    return new TgWalletProvider(await mnemonicToPrivateKey(words));
  }

  static async addressOf(words: string[]): Promise<string> {
    const k = await mnemonicToPrivateKey(words);
    return tgWalletStateInit({ publicKey: k.publicKey, subwalletId: SUBWALLET_ID[cfg.network] }).address.toRawString();
  }

  get publicKeyHex() {
    return this.keys.publicKey.toString('hex');
  }

  private async state() {
    const c = ton();
    const deployed = await c.isContractDeployed(this.address);
    const seqno = deployed ? Number((await c.runMethod(this.address, 'seqno')).stack.readBigNumber()) : 0;
    const balance = await c.getBalance(this.address);
    return { deployed, seqno, balance };
  }

  async send(messages: OutMessage[]) {
    if (messages.length !== 1) throw new Error('one message at a time');
    const m = messages[0];
    const st = await this.state();
    const message = { to: m.to, value: m.value, bounce: m.bounce, body: m.body, init: m.init };

    if (st.balance >= m.value + GAS_MARGIN) {
      const body = sendOne({
        channel: 'external',
        secretKey: this.keys.secretKey,
        header: { subwalletId: this.subwalletId, validUntil: Math.floor(Date.now() / 1000) + TTL, seqno: st.seqno },
        message,
        sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
      });
      await ton().sendFile(externalBoc(this.address, body, st.deployed ? undefined : this.walletInit));
      return;
    }

    if (!m.sponsorable) throw new NeedTonError();
    const request = sendOne({
      channel: 'internal',
      secretKey: this.keys.secretKey,
      header: { subwalletId: this.subwalletId, validUntil: Math.floor(Date.now() / 1000) + TTL, seqno: st.seqno },
      message,
    });
    try {
      await api.relay(request.toBoc().toString('base64'), this.publicKeyHex);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'sponsorship-used-up' || e.code === 'relay-unavailable')) throw new NeedTonError();
      throw e;
    }
  }

  /**
   * Switch to self-custody: the wallet keeps its address but gets a NEW key, so Telegram's backup can no longer open it.
   * The caller generates and SHOWS the new phrase first, and stages it on the device before calling this.
   */
  async rotateKey(words: string[]): Promise<TgWalletProvider> {
    const st = await this.state();
    if (!st.deployed || st.balance < GAS_MARGIN) throw new NeedTonError();
    const next = await mnemonicToPrivateKey(words);
    const body = changeKey({
      channel: 'external',
      secretKey: this.keys.secretKey,
      header: { subwalletId: this.subwalletId, validUntil: Math.floor(Date.now() / 1000) + TTL, seqno: st.seqno },
      wallet: this.address,
      newSecretKey: next.secretKey,
      newPublicKey: next.publicKey,
    });
    await ton().sendFile(externalBoc(this.address, body));
    return new TgWalletProvider(next);
  }

  /** The published key of the wallet on-chain (to confirm a rotation went through). */
  async onchainPublicKey(): Promise<string> {
    const r = await ton().runMethod(this.address, 'get_public_key');
    return r.stack.readBigNumber().toString(16).padStart(64, '0');
  }
}
