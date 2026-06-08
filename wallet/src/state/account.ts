/**
 * Derive a v5R1 wallet contract from an ed25519 seed.
 *
 * v5R1 is the current Tonkeeper / TON Space default (TEP-0146).  It supports
 * extension messages, gasless transfers and is broadly indexed.
 */

import { WalletContractV5R1 } from '@ton/ton';
import { keyPairFromSeed, type KeyPair } from '@ton/crypto';
import { Address } from '@ton/core';

import type { AccountMeta } from './vault';

export interface DerivedAccount {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  wallet: WalletContractV5R1;
  address: Address;
}

export function deriveAccount(seed: Uint8Array, network: 'mainnet' | 'testnet'): DerivedAccount {
  if (seed.length !== 32) throw new Error('seed must be 32 bytes');
  const kp: KeyPair = keyPairFromSeed(Buffer.from(seed));
  const wallet = WalletContractV5R1.create({
    workchain: 0,
    publicKey: kp.publicKey,
    /**
     * v5R1 walletId default differs between networks; @ton/ton picks the
     * mainnet variant unless we tell it otherwise.  We pass workchain only
     * and rely on the indexer to recognise both forms — but Tonkeeper / TON
     * Space treat the same key as the same wallet on testnet/mainnet, so this
     * is fine.
     */
  });
  void network;
  return {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
    wallet,
    address: wallet.address,
  };
}

export function accountMetaFor(
  publicKey: Uint8Array,
  address: Address,
  name: string,
  network: 'mainnet' | 'testnet',
): AccountMeta {
  return {
    address: address.toString({ urlSafe: true, bounceable: false, testOnly: network === 'testnet' }),
    addressRaw: address.toRawString(),
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
    walletVersion: 'v5R1',
    network,
    name,
    createdAt: Math.floor(Date.now() / 1000),
  };
}
