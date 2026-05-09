import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { Address, Cell, internal, toNano, beginCell, SendMode } from '@ton/core';
import { mnemonicToPrivateKey, KeyPair } from '@ton/crypto';
import { OpCodes } from '@rmj/contracts';
import type { AppStore } from './store/appStore';
import { config } from './config';
import { logger } from './logger';

/** Standard Wallet V5 R1 code hash (@ton/ton WalletContractV5R1). */
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
 * The admin wallet is derived from ADMIN_MNEMONIC. In production this
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

  constructor(readonly store: AppStore) {}

  /** True when admin mnemonic + jetton master are set and TonClient is wired — root txs will be broadcast. */
  isReady(): boolean {
    return this.ready;
  }

  async init(): Promise<void> {
    if (!config.JETTON_MASTER_ADDRESS) {
      logger.warn('JETTON_MASTER_ADDRESS not set — root updates will be queued but not sent');
      return;
    }
    if (!config.ADMIN_MNEMONIC) {
      logger.warn('ADMIN_MNEMONIC not set — root updates will be queued but not sent');
      return;
    }

    const endpoint =
      config.TON_RPC_ENDPOINT ||
      (config.TON_NETWORK === 'mainnet'
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC');

    this.client = new TonClient({
      endpoint,
      apiKey: config.TON_RPC_API_KEY || undefined,
    });

    try {
      this.keypair = await mnemonicToPrivateKey(config.ADMIN_MNEMONIC.trim().split(/\s+/));
      this.wallet = this.createAdminWallet(this.keypair.publicKey);
    } catch (e) {
      logger.error(
        { err: e },
        'root updater: admin wallet derivation failed — fix ADMIN_MNEMONIC / ADMIN_WALLET_ADDRESS / ADMIN_WALLET_VERSION',
      );
      return;
    }

    this.ready = true;

    logger.info(
      {
        admin: this.wallet.address.toString(),
        master: config.JETTON_MASTER_ADDRESS,
        admin_wallet_version: config.ADMIN_WALLET_VERSION,
        admin_v5r1_subwallet: config.ADMIN_WALLET_VERSION === 'v5r1' ? config.ADMIN_V5R1_SUBWALLET : undefined,
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

  private createAdminWallet(publicKey: Buffer): WalletContractV4 | WalletContractV5R1 {
    if (config.ADMIN_WALLET_VERSION !== 'v5r1') {
      return WalletContractV4.create({
        workchain: 0,
        publicKey,
      });
    }

    const makeV5 = (subwalletNumber: number) =>
      WalletContractV5R1.create({
        publicKey,
        walletId: {
          networkGlobalId: config.TON_NETWORK === 'mainnet' ? -239 : -3,
          context: { walletVersion: 'v5r1', workchain: 0, subwalletNumber },
        },
      });

    const expectedRaw = config.ADMIN_WALLET_ADDRESS.trim();
    if (expectedRaw) {
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

        if (!hit) {
          throw new Error(
            `ADMIN_WALLET_ADDRESS does not match any v5r1 subwallet (0..32767) for this mnemonic on TON_NETWORK=${config.TON_NETWORK}`,
          );
        }

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
      } catch (e) {
        if (e instanceof Error && e.message.includes('ADMIN_WALLET_ADDRESS does not match')) {
          throw e;
        }
        logger.warn({ admin_wallet_address: expectedRaw }, 'invalid ADMIN_WALLET_ADDRESS, skipping v5r1 auto-detection');
      }
    }

    return makeV5(config.ADMIN_V5R1_SUBWALLET);
  }

  async queue(epoch: number, rootHex: string): Promise<void> {
    if (!this.ready) {
      logger.warn(
        {
          epoch,
          hint: 'Set JETTON_MASTER_ADDRESS and ADMIN_MNEMONIC so epochs commit on-chain; until then proofs may disagree with chain.',
        },
        'root updater idle — Merkle epoch recorded in DB only',
      );
      return;
    }
    if (this.running) {
      logger.debug({ epoch }, 'root updater already processing, will pick this up next tick');
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
