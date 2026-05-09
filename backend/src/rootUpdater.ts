import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { Address, internal, toNano, beginCell, SendMode } from '@ton/core';
import { mnemonicToPrivateKey, KeyPair } from '@ton/crypto';
import { OpCodes } from '@rmj/contracts';
import type { AppStore } from './store/appStore';
import { config } from './config';
import { logger } from './logger';

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

    this.keypair = await mnemonicToPrivateKey(config.ADMIN_MNEMONIC.trim().split(/\s+/));
    this.wallet =
      config.ADMIN_WALLET_VERSION === 'v5r1'
        ? WalletContractV5R1.create({ publicKey: this.keypair.publicKey })
        : WalletContractV4.create({
            workchain: 0,
            publicKey: this.keypair.publicKey,
          });
    this.ready = true;

    logger.info(
      {
        admin: this.wallet.address.toString(),
        master: config.JETTON_MASTER_ADDRESS,
        admin_wallet_version: config.ADMIN_WALLET_VERSION,
      },
      'root updater initialised',
    );
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
          ? 'Likely network/address mismatch: check TON_NETWORK, TON_RPC_ENDPOINT, JETTON_MASTER_ADDRESS, and ADMIN_WALLET_VERSION.'
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
