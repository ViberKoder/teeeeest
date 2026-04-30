import { TonClient, WalletContractV4 } from '@ton/ton';
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
  private wallet?: WalletContractV4;
  private keypair?: KeyPair;
  private ready = false;
  private running = false;

  constructor(readonly store: AppStore) {}

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
    this.wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: this.keypair.publicKey,
    });
    this.ready = true;

    logger.info(
      { admin: this.wallet.address.toString(), master: config.JETTON_MASTER_ADDRESS },
      'root updater initialised',
    );
  }

  async queue(epoch: number, rootHex: string): Promise<void> {
    if (!this.ready) {
      logger.debug({ epoch }, 'root updater not ready, committed_tx will remain null');
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
      logger.error({ err: e, epoch, rootHex }, 'root update send failed');
    } finally {
      this.running = false;
    }
  }

  private async sendOnce(epoch: number, rootHex: string): Promise<void> {
    if (!this.client || !this.wallet || !this.keypair) return;

    const master = Address.parse(config.JETTON_MASTER_ADDRESS);

    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    const body = beginCell()
      .storeUint(OpCodes.updateMerkleRoot, 32)
      .storeUint(BigInt(epoch), 64) // query_id
      .storeUint(BigInt(rootHex), 256)
      .storeUint(epoch, 32)
      .endCell();

    await walletContract.sendTransfer({
      seqno,
      secretKey: this.keypair.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [
        internal({
          to: master,
          value: toNano('0.02'),
          body,
          bounce: true,
        }),
      ],
    });

    await this.store.updateEpochCommitted(
      epoch,
      `seqno:${seqno}`,
      Math.floor(Date.now() / 1000),
    );

    logger.info({ epoch, rootHex, seqno }, 'root update broadcast');
  }
}
