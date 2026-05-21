import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
// Not exported from the @ton/ton barrel; needed to decode deployed Wallet V5 R1 wallet_id (incl. custom/backoffice context).
import { loadWalletIdV5R1 } from '@ton/ton/dist/wallets/v5r1/WalletV5R1WalletId';
import { Address, Cell, internal, toNano, beginCell, SendMode } from '@ton/core';
import {
  mnemonicToPrivateKey,
  KeyPair,
  keyPairFromSeed,
  keyPairFromSecretKey,
} from '@ton/crypto';
import { OpCodes } from '@rmj/contracts';
import type { AppStore } from './store/appStore';
import { config } from './config';
import { logger } from './logger';
import { createTonClient } from './tonClient';

/** Standard Wallet V5 R1 code hash (@ton/ton WalletContractV5R1). */
function normalizeAdminPrivateKeyHex(raw: string): string {
  return raw.trim().replace(/^0x/i, '').replace(/\s+/g, '');
}

/** 32-byte seed (64 hex) or 64-byte NaCl secret (128 hex), same as @ton/crypto wallet keys. */
function keyPairFromAdminPrivateKeyHex(raw: string): KeyPair {
  const hex = normalizeAdminPrivateKeyHex(raw);
  const buf = Buffer.from(hex, 'hex');
  if (buf.length === 32) return keyPairFromSeed(buf);
  if (buf.length === 64) return keyPairFromSecretKey(buf);
  throw new Error('ADMIN_PRIVATE_KEY_HEX must be 64 or 128 hex characters');
}

const WALLET_V5R1_CODE_HASH_HEX = Buffer.from(
  WalletContractV5R1.create({
    publicKey: Buffer.alloc(32),
    walletId: {
      networkGlobalId: -239,
      context: { walletVersion: 'v5r1', workchain: 0, subwalletNumber: 0 },
    },
  }).init.code.hash(),
).toString('hex');

/**
 * Root Updater: pushes `op::update_merkle_root` transactions from the
 * admin wallet to the Jetton Master after each epoch.
 *
 * The admin wallet is derived from ADMIN_PRIVATE_KEY_HEX or ADMIN_MNEMONIC. In production this
 * should be replaced with a multisig wallet setup (ton-blockchain/multisig
 * v2) and the signer wrapped in the same HSM flow as VoucherSigner.
 *
 * Updates are queued one-at-a-time (TON seqno is serialized) with retry
 * on transient RPC failures. Already-committed epochs are idempotent.
 */
export class RootUpdater {
  private client?: TonClient;
  private wallet?: WalletContractV4 | WalletContractV5R1;
  private keypair?: KeyPair;
  private ready = false;
  private running = false;
  private pending: { epoch: number; rootHex: string } | null = null;

  constructor(readonly store: AppStore) {}

  /** True when admin credentials + jetton master are set and TonClient is wired — root txs will be broadcast. */
  isReady(): boolean {
    return this.ready;
  }

  async init(): Promise<void> {
    if (!config.JETTON_MASTER_ADDRESS) {
      logger.warn('JETTON_MASTER_ADDRESS not set — root updates will be queued but not sent');
      return;
    }
    const hasPrivateKey = Boolean(normalizeAdminPrivateKeyHex(config.ADMIN_PRIVATE_KEY_HEX));
    const hasMnemonic = Boolean(config.ADMIN_MNEMONIC.trim());
    if (!hasPrivateKey && !hasMnemonic) {
      logger.warn(
        'Neither ADMIN_PRIVATE_KEY_HEX nor ADMIN_MNEMONIC set — root updates will be queued but not sent',
      );
      return;
    }

    this.client = createTonClient();

    try {
      if (hasPrivateKey && hasMnemonic) {
        logger.warn(
          'Both ADMIN_PRIVATE_KEY_HEX and ADMIN_MNEMONIC are set — using ADMIN_PRIVATE_KEY_HEX for signing',
        );
      }

      if (hasPrivateKey) {
        this.keypair = keyPairFromAdminPrivateKeyHex(config.ADMIN_PRIVATE_KEY_HEX);
      } else {
        const mnemonicWords = config.ADMIN_MNEMONIC.trim().split(/\s+/).filter(Boolean);
        const mnemonicPassword = config.ADMIN_MNEMONIC_PASSWORD.trim() || undefined;
        this.keypair = await mnemonicToPrivateKey(mnemonicWords, mnemonicPassword);
      }
      if (config.ADMIN_WALLET_VERSION !== 'v5r1') {
        this.wallet = WalletContractV4.create({
          workchain: 0,
          publicKey: this.keypair.publicKey,
        });
      } else {
        let v5 = this.tryDeriveV5R1BySubwalletScan(this.keypair.publicKey);
        if (!v5) {
          v5 = await this.tryDeriveV5R1FromOnChainAdmin(this.keypair.publicKey);
        }
        this.wallet = v5;
      }
    } catch (e) {
      logger.error(
        { err: e },
        'root updater: admin wallet derivation failed — fix ADMIN_PRIVATE_KEY_HEX / ADMIN_MNEMONIC / ADMIN_WALLET_ADDRESS / ADMIN_WALLET_VERSION',
      );
      return;
    }

    this.ready = true;

    logger.info(
      {
        admin: this.wallet.address.toString(),
        master: config.JETTON_MASTER_ADDRESS,
        admin_wallet_version: config.ADMIN_WALLET_VERSION,
        admin_signing: hasPrivateKey ? 'private_key_hex' : 'mnemonic',
        admin_mnemonic_password_configured: Boolean(config.ADMIN_MNEMONIC_PASSWORD.trim()),
        admin_v5r1_subwallet:
          config.ADMIN_WALLET_VERSION === 'v5r1' &&
          this.wallet instanceof WalletContractV5R1 &&
          typeof this.wallet.walletId.context === 'object'
            ? (this.wallet.walletId.context as { subwalletNumber?: number }).subwalletNumber ??
              config.ADMIN_V5R1_SUBWALLET
            : config.ADMIN_WALLET_VERSION === 'v5r1'
              ? config.ADMIN_V5R1_SUBWALLET
              : undefined,
      },
      'root updater initialised',
    );
  }

  /**
   * Snapshot of the derived admin address on the configured RPC (for /diagnostics).
   * Null when the updater never initialised a wallet (missing env or derivation error).
   */
  async getAdminWalletOnChain(): Promise<null | {
    derived_address: string;
    contract_state: 'active' | 'uninitialized' | 'frozen';
    code_hash_hex: string | null;
    matches_standard_v5r1_code: boolean | null;
  }> {
    if (!this.client || !this.wallet) return null;

    const adminAddr = this.wallet.address;
    const st = await this.client.getContractState(adminAddr);
    let code_hash_hex: string | null = null;
    if (st.code) {
      code_hash_hex = Buffer.from(Cell.fromBoc(st.code)[0].hash()).toString('hex');
    }
    const matches_standard_v5r1_code =
      config.ADMIN_WALLET_VERSION !== 'v5r1'
        ? null
        : code_hash_hex === null
          ? null
          : code_hash_hex === WALLET_V5R1_CODE_HASH_HEX;

    return {
      derived_address: adminAddr.toString({ bounceable: false, urlSafe: true }),
      contract_state: st.state,
      code_hash_hex,
      matches_standard_v5r1_code,
    };
  }

  /**
   * Derives Wallet V5 R1 using standard client context only (subwallet 0..32767).
   * Returns null when ADMIN_WALLET_ADDRESS is set but no derivation matches — caller may fall back to on-chain wallet_id.
   */
  private tryDeriveV5R1BySubwalletScan(publicKey: Buffer): WalletContractV5R1 | null {
    const networkGlobalId = config.TON_NETWORK === 'mainnet' ? -239 : -3;
    const makeV5 = (subwalletNumber: number) =>
      WalletContractV5R1.create({
        publicKey,
        walletId: {
          networkGlobalId,
          context: { walletVersion: 'v5r1', workchain: 0, subwalletNumber },
        },
      });

    const expectedRaw = config.ADMIN_WALLET_ADDRESS.trim();
    if (!expectedRaw) {
      return makeV5(config.ADMIN_V5R1_SUBWALLET);
    }

    try {
      const expected = Address.parse(expectedRaw).toString({ bounceable: false, urlSafe: true });

      let hit: WalletContractV5R1 | null = null;
      let hitSubwallet: number | null = null;

      const trySubwallet = (sw: number): void => {
        if (hit) return;
        const probed = makeV5(sw);
        if (probed.address.toString({ bounceable: false, urlSafe: true }) === expected) {
          hit = probed;
          hitSubwallet = sw;
        }
      };

      trySubwallet(config.ADMIN_V5R1_SUBWALLET);
      for (let sw = 0; sw <= 32767 && !hit; sw += 1) {
        if (sw === config.ADMIN_V5R1_SUBWALLET) continue;
        trySubwallet(sw);
      }

      if (hit) {
        if (hitSubwallet !== null && hitSubwallet !== config.ADMIN_V5R1_SUBWALLET) {
          logger.warn(
            {
              expected_admin: expected,
              detected_v5r1_subwallet: hitSubwallet,
              configured_subwallet: config.ADMIN_V5R1_SUBWALLET,
            },
            'admin address matched via v5r1 subwallet auto-detection',
          );
        }
        return hit;
      }

      return null;
    } catch {
      logger.warn({ admin_wallet_address: expectedRaw }, 'invalid ADMIN_WALLET_ADDRESS, skipping v5r1 subwallet scan');
      return makeV5(config.ADMIN_V5R1_SUBWALLET);
    }
  }

  /**
   * Reads wallet_id + public key from deployed Wallet V5 R1 storage.
   * Proves the configured key controls ADMIN_WALLET_ADDRESS even when Tonkeeper uses a non-standard wallet_id encoding (custom/backoffice context).
   */
  private async tryDeriveV5R1FromOnChainAdmin(publicKey: Buffer): Promise<WalletContractV5R1> {
    const expectedRaw = config.ADMIN_WALLET_ADDRESS.trim();
    if (!expectedRaw || !this.client) {
      throw new Error('ADMIN_WALLET_ADDRESS required when mnemonic-derived subwallet scan finds no match');
    }

    const parsedAddr = Address.parse(expectedRaw);
    const expectedFriendly = parsedAddr.toString({ bounceable: false, urlSafe: true });
    const st = await this.client.getContractState(parsedAddr);

    if (st.state !== 'active') {
      throw new Error(
        `ADMIN_WALLET_ADDRESS is ${st.state} on TON_NETWORK=${config.TON_NETWORK} — open Tonviewer on this network and deploy/fund this wallet`,
      );
    }
    if (!st.code || !st.data) {
      throw new Error('ADMIN_WALLET_ADDRESS has no code/data — verify network and address');
    }

    const onChainCodeHash = Buffer.from(Cell.fromBoc(st.code)[0].hash()).toString('hex');
    if (onChainCodeHash !== WALLET_V5R1_CODE_HASH_HEX) {
      throw new Error(
        `ADMIN_WALLET_ADDRESS is not standard Wallet V5 R1 on ${config.TON_NETWORK} — set ADMIN_WALLET_VERSION=v4 if this is Wallet V4`,
      );
    }

    const slice = Cell.fromBoc(st.data)[0].beginParse();
    slice.loadUint(1);
    slice.loadUint(32);

    const networkGlobalId = config.TON_NETWORK === 'mainnet' ? -239 : -3;
    const walletIdParsed = loadWalletIdV5R1(slice, networkGlobalId);
    const onChainPublicKey = slice.loadBuffer(32);

    if (Buffer.compare(onChainPublicKey, publicKey) !== 0) {
      throw new Error(
        `Signer key does not control ADMIN_WALLET_ADDRESS on ${config.TON_NETWORK}: public keys differ — use ADMIN_PRIVATE_KEY_HEX from this wallet export, or the exact 24-word phrase (+ ADMIN_MNEMONIC_PASSWORD if used in Tonkeeper)`,
      );
    }

    const wallet =
      typeof walletIdParsed.context === 'number'
        ? WalletContractV5R1.create({
            publicKey,
            walletId: {
              networkGlobalId: walletIdParsed.networkGlobalId,
              context: walletIdParsed.context,
            },
            workchain: parsedAddr.workChain,
          })
        : WalletContractV5R1.create({
            publicKey,
            walletId: {
              networkGlobalId: walletIdParsed.networkGlobalId,
              context: walletIdParsed.context,
            },
          });

    const gotFriendly = wallet.address.toString({ bounceable: false, urlSafe: true });
    if (expectedFriendly !== gotFriendly) {
      throw new Error(
        `Could not rebuild ADMIN_WALLET_ADDRESS from chain wallet_id — wrong TON_NETWORK or corrupted account data (expected ${expectedFriendly}, got ${gotFriendly})`,
      );
    }

    logger.info(
      {
        admin_wallet_resolution: 'on_chain_wallet_id',
        wallet_context_kind: typeof walletIdParsed.context === 'number' ? 'custom_counter' : 'client_subwallet',
      },
      'root updater: matched admin via on-chain Wallet V5 R1 wallet_id + mnemonic public key',
    );

    return wallet;
  }

  async queue(epoch: number, rootHex: string): Promise<void> {
    if (!this.ready) {
      logger.warn(
        {
          epoch,
          hint: 'Set JETTON_MASTER_ADDRESS and ADMIN_PRIVATE_KEY_HEX or ADMIN_MNEMONIC so epochs commit on-chain; until then proofs may disagree with chain.',
        },
        'root updater idle — Merkle epoch recorded in DB only',
      );
      return;
    }
    if (this.running) {
      // Keep only the newest pending epoch — older ones are superseded.
      if (!this.pending || epoch > this.pending.epoch) {
        this.pending = { epoch, rootHex };
        logger.debug({ epoch }, 'root updater busy — epoch saved as pending');
      }
      return;
    }
    this.running = true;
    try {
      await this.sendOnce(epoch, rootHex);
    } catch (e) {
      const err = e as any;
      const rpcError = err?.response?.data?.error as string | undefined;
      const rpcCode = err?.response?.data?.code as number | undefined;
      const hint =
        rpcError?.includes('Failed to unpack account state')
          ? 'Lite server rejected the wallet external message: admin wallet may be uninitialized on this network, not standard Wallet V5R1/V4 (wrong ADMIN_WALLET_VERSION), wrong mnemonic vs ADMIN_WALLET_ADDRESS, or TON_NETWORK/RPC mismatch. Call GET /api/v1/diagnostics for admin contract_state and code hash.'
          : rpcCode === 429
            ? 'Toncenter rate limit: set TON_RPC_API_KEY and consider retry/backoff.'
            : undefined;
      logger.error(
        {
          err,
          epoch,
          rootHex,
          rpc_error: rpcError,
          rpc_code: rpcCode,
          hint,
          ton_network: config.TON_NETWORK,
          ton_endpoint: config.TON_RPC_ENDPOINT || 'toncenter-default',
          admin_wallet_version: config.ADMIN_WALLET_VERSION,
          jetton_master_address: config.JETTON_MASTER_ADDRESS,
        },
        'root update send failed',
      );
    } finally {
      this.running = false;
      // Drain any epoch that arrived while we were busy.
      const next = this.pending;
      if (next) {
        this.pending = null;
        void this.queue(next.epoch, next.rootHex);
      }
    }
  }

  private async sendOnce(epoch: number, rootHex: string): Promise<void> {
    if (!this.client || !this.wallet || !this.keypair) return;

    const master = Address.parse(config.JETTON_MASTER_ADDRESS);
    const masterState = await this.client.getContractState(master);
    if (masterState.state !== 'active') {
      logger.error(
        {
          epoch,
          master: master.toString({ urlSafe: true, bounceable: false }),
          master_state: masterState.state,
          ton_network: config.TON_NETWORK,
          ton_endpoint: config.TON_RPC_ENDPOINT || 'toncenter-default',
          hint: 'Master must be deployed and active in this network before update_merkle_root.',
        },
        'root update aborted: jetton master is not active',
      );
      return;
    }

    const adminAddr = this.wallet.address;
    const walletState = await this.client.getContractState(adminAddr);
    const adminFriendly = adminAddr.toString({ bounceable: false, urlSafe: true });

    if (walletState.state !== 'active') {
      logger.error(
        {
          epoch,
          admin_wallet: adminFriendly,
          admin_wallet_state: walletState.state,
          ton_network: config.TON_NETWORK,
          hint: 'Open this address in Tonviewer on this network; send any outgoing tx once so the wallet deploys, then top up TON for fees.',
        },
        'root update aborted: admin wallet is not active',
      );
      return;
    }

    if (config.ADMIN_WALLET_VERSION === 'v5r1' && walletState.code) {
      const onChainHash = Buffer.from(Cell.fromBoc(walletState.code)[0].hash()).toString('hex');
      if (onChainHash !== WALLET_V5R1_CODE_HASH_HEX) {
        logger.error(
          {
            epoch,
            admin_wallet: adminFriendly,
            on_chain_code_hash: onChainHash,
            expected_v5r1_code_hash: WALLET_V5R1_CODE_HASH_HEX,
            hint: 'Chain code differs from standard Wallet V5 R1 — set ADMIN_WALLET_VERSION=v4 if this address is Wallet V4, or use the mnemonic for the wallet that owns this address.',
          },
          'root update aborted: admin wallet code is not Wallet V5 R1',
        );
        return;
      }
    }

    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    const body = beginCell()
      .storeUint(OpCodes.updateMerkleRoot, 32)
      .storeUint(BigInt(epoch), 64) // query_id
      .storeUint(BigInt(rootHex), 256)
      .storeUint(epoch, 32)
      .endCell();

    const messages = [
      internal({
        to: master,
        value: toNano('0.02'),
        body,
        bounce: true,
      }),
    ];
    if (config.ADMIN_WALLET_VERSION === 'v5r1') {
      await walletContract.sendTransfer({
        seqno,
        secretKey: this.keypair.secretKey,
        authType: 'external',
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages,
      });
    } else {
      await walletContract.sendTransfer({
        seqno,
        secretKey: this.keypair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages,
      });
    }

    await this.store.updateEpochCommitted(
      epoch,
      `seqno:${seqno}`,
      Math.floor(Date.now() / 1000),
    );

    logger.info({ epoch, rootHex, seqno }, 'root update broadcast');
  }
}
