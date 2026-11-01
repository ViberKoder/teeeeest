import { Address, beginCell, storeStateInit } from '@ton/core';
import { TonConnectUI } from '@tonconnect/ui';
import { cfg } from '../config';
import type { OutMessage, WalletProvider } from './types';

let ui: TonConnectUI | undefined;

export function tonConnect(): TonConnectUI {
  ui ??= new TonConnectUI({
    manifestUrl: `${cfg.publicUrl || location.origin}/tonconnect-manifest.json`,
    uiPreferences: { borderRadius: 'm' },
  });
  return ui;
}

/** External wallet over TON Connect (Telegram Wallet and any other TON Connect wallet). */
export class TonConnectProvider implements WalletProvider {
  readonly kind = 'tonconnect' as const;
  constructor(readonly address: Address, private readonly ui: TonConnectUI) {}

  static fromConnected(): TonConnectProvider | null {
    const u = tonConnect();
    const acc = u.account;
    return acc ? new TonConnectProvider(Address.parseRaw(acc.address), u) : null;
  }

  async send(messages: OutMessage[]) {
    await this.ui.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: messages.map((m) => ({
        address: m.to.toString({ bounceable: m.bounce, urlSafe: true }),
        amount: m.value.toString(),
        payload: m.body?.toBoc().toString('base64'),
        stateInit: m.init
          ? beginCell().store(storeStateInit(m.init)).endCell().toBoc().toString('base64')
          : undefined,
      })),
    });
  }

  async disconnect() {
    await this.ui.disconnect();
  }
}
