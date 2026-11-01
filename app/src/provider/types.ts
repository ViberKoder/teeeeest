import { Address, Cell } from '@ton/core';

export interface OutMessage {
  to: Address;
  value: bigint;
  body?: Cell;
  init?: { code: Cell; data: Cell };
  bounce: boolean;
}

/**
 * Anything that can sign and broadcast messages for one address:
 * the built-in self-custody wallet, or an external wallet over TON Connect
 * (Telegram Wallet and any other TON Connect wallet).
 * The app builds messages once; providers only differ in who signs them.
 */
export interface WalletProvider {
  readonly kind: 'builtin' | 'tonconnect';
  readonly address: Address;
  send(messages: OutMessage[]): Promise<void>;
}
