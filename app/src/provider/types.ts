import { Address, Cell, StateInit } from '@ton/core';

export interface OutMessage {
  to: Address;
  value: bigint;
  body?: Cell;
  init?: StateInit;
  bounce: boolean;
  /** this message is the player's own claim — the one thing the server will pay to deliver for a player with no TON */
  sponsorable?: boolean;
}

/** Anything that can sign and broadcast messages for one wallet address. */
export interface WalletProvider {
  readonly address: Address;
  send(messages: OutMessage[]): Promise<void>;
}
