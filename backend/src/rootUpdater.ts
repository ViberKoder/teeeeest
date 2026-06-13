import { TonClient, WalletContractV4, WalletContractV5R1, JettonMaster } from '@ton/ton';
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
import type { AirdropState } from './state';
import { config } from './config';
import { logger } from './logger';
import { createTonClient } from './tonClient';
import { fixedJettonMetadataUrl } from './jettonAddressPath';
import { buildChangeContentBody, parseOffchainContentUri } from './jettonContent';
import { epochMetadataUri, metadataUriEpoch } from './metadataUriUtils';
import {
  isZeroRoot,
  readOnChainMerkle,
  rootsMatch,
  waitForOnChainMerkle,
  type OnChainMerkle,
} from './onChainMerkle';

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

/** Internal message value for `update_merkle_root` (matches contract wrapper default). */
const MERKLE_ROOT_MSG_VALUE = toNano('0.02');
/** Internal message value for `change_content` — keep ≤0.01 TON per epoch. */
const METADATA_BUMP_MSG_VALUE = toNano('0.008');

export type RootSyncReport = {
  synced: boolean;
  reason?: string;
  target_root?: string;
  target_epoch?: number;
  on_chain?: OnChainMerkle | null;
  broadcast_epoch?: number;
  metadata_uri?: string;
  metadata_bump_skipped?: boolean;
};

/**
 * Root Updater: pushes `op::update_merkle_root` transactions from the
 * admin wallet to the Jetton Master after each epoch.
 *
 * Verifies on-chain root after broadcast — DB epoch may run ahead of chain
 * if earlier sends failed while rootUpdater was not ready.
 */
export class RootUpdater {
  private client?: TonClient;
  private wallet?: WalletContractV4 | WalletContractV5R1;
  private keypair?: KeyPair;
  private ready = false;
  private running = false;
  private masterAdmin: Address | null = null;

  constructor(readonly store: AppStore) {}

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

      const master = Address.parse(config.JETTON_MASTER_ADDRESS);
      const masterJetton = this.client.open(JettonMaster.create(master));
      const jettonData = await masterJetton.getJettonData();
      this.masterAdmin = jettonData.adminAddress;

      if (!this.masterAdmin!.equals(this.wallet!.address)) {
        logger.error(
          {
            jetton_admin: this.masterAdmin!.toString({ urlSafe: true, bounceable: false }),
            signer_wallet: this.wallet!.address.toString({ urlSafe: true, bounceable: false }),
            hint: 'ADMIN_MNEMONIC / ADMIN_PRIVATE_KEY_HEX must control the jetton master admin address',
          },
          'root updater: signer wallet ≠ jetton master admin — update_merkle_root will bounce',
        );
        return;
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
        admin: this.wallet!.address.toString(),
        master: config.JETTON_MASTER_ADDRESS,
        jetton_admin_matches_signer: true,
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

  async readOnChainMerkle(): Promise<OnChainMerkle | null> {
    if (!this.client || !config.JETTON_MASTER_ADDRESS) return null;
    return readOnChainMerkle(this.client, Address.parse(config.JETTON_MASTER_ADDRESS));
  }

  async readOnChainMetadataUri(): Promise<string | null> {
    if (!this.client || !config.JETTON_MASTER_ADDRESS) return null;
    try {
      const master = Address.parse(config.JETTON_MASTER_ADDRESS);
      const masterJetton = this.client.open(JettonMaster.create(master));
      const jettonData = await masterJetton.getJettonData();
      return parseOffchainContentUri(jettonData.content);
    } catch (e) {
      logger.warn({ err: e }, 'root updater: could not read on-chain metadata URI');
      return null;
    }
  }

  /** True when off-chain tree root ≠ on-chain root (indexers will reject merkle dump). */
  async needsOnChainSync(state: AirdropState): Promise<boolean> {
    if (state.tree.isEmpty()) return false;
    const onChain = await this.readOnChainMerkle();
    if (!onChain) return true;
    return !rootsMatch(onChain.root, state.rootBigint());
  }

  /**
   * Ensure on-chain merkle root matches the live tree. Uses on_chain_epoch + 1
   * when catching up (DB epoch may be far ahead).
   */
  async syncWithState(state: AirdropState, opts?: { force?: boolean }): Promise<RootSyncReport> {
    if (!this.ready) {
      return { synced: false, reason: 'root-updater-not-ready' };
    }
    if (state.tree.isEmpty()) {
      return { synced: true, reason: 'empty-tree' };
    }

    if (this.running) {
      return { synced: false, reason: 'root-updater-busy' };
    }

    const targetRoot = state.rootBigint();
    const targetRootHex = state.rootHex();

    const onChain = await this.readOnChainMerkle();
    if (!onChain) {
      return { synced: false, reason: 'on-chain-read-failed', target_root: targetRootHex };
    }

    if (!opts?.force && rootsMatch(onChain.root, targetRoot)) {
      await this.store.setKv('last_onchain_merkle_root', targetRootHex);
      await this.store.setKv('last_onchain_merkle_epoch', String(onChain.epoch));
      return { synced: true, target_root: targetRootHex, on_chain: onChain };
    }

    if (isZeroRoot(onChain.root) && !isZeroRoot(targetRoot)) {
      logger.warn(
        {
          on_chain_epoch: onChain.epoch,
          off_chain_epoch: state.epoch,
          target_root: targetRootHex,
        },
        'on-chain merkle root is zero — mintless indexers will reject dump until update_merkle_root lands',
      );
    }

    this.running = true;
    try {
      const broadcastEpoch = onChain.epoch + 1;
      const metadataUri = epochMetadataUri(fixedJettonMetadataUrl(config.PUBLIC_APP_URL), broadcastEpoch);
      const onChainMetaUri = await this.readOnChainMetadataUri();
      const needsMetadataBump = metadataUriEpoch(onChainMetaUri) !== broadcastEpoch;

      const sent = await this.sendEpochCommit(broadcastEpoch, targetRootHex, needsMetadataBump ? metadataUri : null);
      if (!sent.ok) {
        return {
          synced: false,
          reason: sent.reason ?? 'send-failed',
          target_root: targetRootHex,
          on_chain: onChain,
          broadcast_epoch: broadcastEpoch,
          metadata_uri: needsMetadataBump ? metadataUri : onChainMetaUri ?? undefined,
          metadata_bump_skipped: !needsMetadataBump,
        };
      }

      const confirmed = await waitForOnChainMerkle(
        this.client!,
        Address.parse(config.JETTON_MASTER_ADDRESS),
        targetRoot,
        broadcastEpoch,
        { attempts: 25, delayMs: 4000 },
      );

      if (!confirmed) {
        logger.error(
          {
            broadcast_epoch: broadcastEpoch,
            target_root: targetRootHex,
            on_chain_before: onChain,
          },
          'update_merkle_root broadcast but on-chain root still mismatched after wait',
        );
        return {
          synced: false,
          reason: 'tx-not-confirmed-on-chain',
          target_root: targetRootHex,
          on_chain: onChain,
          broadcast_epoch: broadcastEpoch,
        };
      }

      await this.store.setKv('last_onchain_merkle_root', targetRootHex);
      await this.store.setKv('last_onchain_merkle_epoch', String(confirmed.epoch));
      await this.store.setKv('last_committed_root', targetRootHex);
      if (needsMetadataBump) {
        await this.store.setKv('last_metadata_bump_epoch', String(broadcastEpoch));
        await this.store.setKv('last_metadata_bump_uri', metadataUri);
      }
      await this.store.updateEpochCommitted(
        broadcastEpoch,
        `confirmed:${confirmed.epoch}`,
        Math.floor(Date.now() / 1000),
      );

      logger.info(
        {
          broadcast_epoch: broadcastEpoch,
          on_chain_epoch: confirmed.epoch,
          root: targetRootHex,
          off_chain_db_epoch: state.epoch,
          metadata_uri: needsMetadataBump ? metadataUri : onChainMetaUri,
          metadata_bump_skipped: !needsMetadataBump,
        },
        'merkle root committed on-chain',
      );

      return {
        synced: true,
        target_root: targetRootHex,
        target_epoch: broadcastEpoch,
        on_chain: confirmed,
        broadcast_epoch: broadcastEpoch,
        metadata_uri: needsMetadataBump ? metadataUri : onChainMetaUri ?? undefined,
        metadata_bump_skipped: !needsMetadataBump,
      };
    } catch (e) {
      const err = e as Error;
      logger.error({ err, target_root: targetRootHex }, 'merkle root sync failed');
      return { synced: false, reason: err.message, target_root: targetRootHex, on_chain: onChain };
    } finally {
      this.running = false;
    }
  }

  /** @deprecated Use syncWithState — kept for treeBuilder hook. */
  async queue(_epoch: number, _rootHex: string): Promise<void> {
    logger.debug('rootUpdater.queue is deprecated — treeBuilder calls syncWithState');
  }

  scheduleInitialSync(state: AirdropState): void {
    setTimeout(() => {
      void this.syncWithState(state, { force: false }).then((report) => {
        if (!report.synced && report.reason !== 'empty-tree') {
          logger.warn({ report }, 'startup merkle root sync incomplete');
        }
      });
    }, 5_000);
  }

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

  private async sendEpochCommit(
    epoch: number,
    rootHex: string,
    metadataUri: string | null,
  ): Promise<{ ok: boolean; reason?: string; seqno?: number }> {
    if (!this.client || !this.wallet || !this.keypair) {
      return { ok: false, reason: 'not-initialised' };
    }

    const master = Address.parse(config.JETTON_MASTER_ADDRESS);
    const masterState = await this.client.getContractState(master);
    if (masterState.state !== 'active') {
      logger.error(
        {
          epoch,
          master: master.toString({ urlSafe: true, bounceable: false }),
          master_state: masterState.state,
          ton_network: config.TON_NETWORK,
          hint: 'Master must be deployed and active in this network before update_merkle_root.',
        },
        'root update aborted: jetton master is not active',
      );
      return { ok: false, reason: 'master-not-active' };
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
      return { ok: false, reason: 'admin-wallet-not-active' };
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
            hint: 'Chain code differs from standard Wallet V5 R1 — set ADMIN_WALLET_VERSION=v4 if this address is Wallet V4.',
          },
          'root update aborted: admin wallet code is not Wallet V5 R1',
        );
        return { ok: false, reason: 'admin-wallet-not-v5r1' };
      }
    }

    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    const rootBigint = BigInt(rootHex);
    const merkleBody = beginCell()
      .storeUint(OpCodes.updateMerkleRoot, 32)
      .storeUint(BigInt(epoch), 64)
      .storeUint(rootBigint, 256)
      .storeUint(epoch, 32)
      .endCell();

    const messages = [
      internal({
        to: master,
        value: MERKLE_ROOT_MSG_VALUE,
        body: merkleBody,
        bounce: true,
      }),
    ];

    if (metadataUri) {
      messages.push(
        internal({
          to: master,
          value: METADATA_BUMP_MSG_VALUE,
          body: buildChangeContentBody(metadataUri),
          bounce: true,
        }),
      );
    }

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

    logger.info(
      { epoch, rootHex, seqno, metadata_uri: metadataUri, metadata_bump: Boolean(metadataUri) },
      'update_merkle_root (+ metadata bump) broadcast',
    );
    return { ok: true, seqno };
  }
}
