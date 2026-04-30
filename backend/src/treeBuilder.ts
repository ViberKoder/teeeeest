import { AirdropState } from './state';
import { GameServer } from './gameServer';
import type { AppStore } from './store/appStore';
import { VoucherSigner } from './signer';
import { RootUpdater } from './rootUpdater';
import { config } from './config';
import { logger } from './logger';

/**
 * Tree Builder advances the Airdrop HashMap to a new epoch on a schedule.
 *
 * Workflow per tick:
 *
 *   1. Collect all users with activity since the previous epoch boundary.
 *   2. Update their leaves in the in-memory AirdropTree.
 *   3. Recompute the root hash.
 *   4. If the root actually changed, advance the epoch counter, sign a
 *      RootVoucher, persist to the `epochs` table, and queue an on-chain
 *      `update_merkle_root` transaction via the RootUpdater.
 *
 * The Proof API reads from the same in-memory state, so proofs are always
 * generated against the current root even between on-chain commits.
 */
export class TreeBuilder {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    readonly store: AppStore,
    readonly state: AirdropState,
    readonly gameServer: GameServer,
    readonly signer: VoucherSigner,
    readonly rootUpdater: RootUpdater,
  ) {}

  start(): void {
    if (this.timer) return;
    logger.info({ every: config.EPOCH_DURATION_SECONDS }, 'tree builder started');
    this.timer = setInterval(
      () => this.tick().catch((e) => logger.error({ err: e }, 'tree builder tick failed')),
      config.EPOCH_DURATION_SECONDS * 1000,
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(force = false): Promise<{ advanced: boolean; epoch: number; root: string }> {
    if (this.running) {
      return { advanced: false, epoch: this.state.epoch, root: this.state.rootHex() };
    }
    this.running = true;
    try {
      const lastEpochKv = await this.store.getKv('last_epoch_at');
      const lastEpochTime = Number(lastEpochKv ?? 0);
      const active = await this.gameServer.listActiveSince(lastEpochTime);

      if (active.length === 0 && !force) {
        logger.debug('no activity since last epoch; skipping');
        return { advanced: false, epoch: this.state.epoch, root: this.state.rootHex() };
      }

      this.state.applyUpdates(
        active.map(({ address, cumulative }) => ({ address, cumulative })),
      );

      const prevRoot = this.state.rootHex();
      const root = this.state.rootBigint();
      const rootHex = this.state.rootHex();

      const lastCommitted = await this.store.getKv('last_committed_root');
      if (!force && rootHex === lastCommitted) {
        logger.debug('root unchanged; skipping commit');
        return { advanced: false, epoch: this.state.epoch, root: rootHex };
      }

      const newEpoch = await this.state.advanceEpoch(this.store);
      const voucher = this.signer.signRootHex(newEpoch, root);

      const now = Math.floor(Date.now() / 1000);
      await this.store.insertEpoch({
        epoch: newEpoch,
        merkleRoot: voucher.root,
        signedBy: this.signer.publicKeyHex,
        signature: voucher.signature,
        createdAt: now,
      });

      await this.store.setKv('last_epoch_at', String(now));
      await this.store.setKv('last_committed_root', rootHex);

      logger.info(
        {
          epoch: newEpoch,
          root: rootHex,
          activeUsers: active.length,
          treeSize: this.state.tree.size,
          prevRoot,
        },
        'epoch advanced',
      );

      await this.rootUpdater.queue(newEpoch, rootHex);

      return { advanced: true, epoch: newEpoch, root: rootHex };
    } finally {
      this.running = false;
    }
  }
}
