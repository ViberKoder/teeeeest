import { AirdropState } from './state';
import { GameServer } from './gameServer';
import type { AppStore } from './store/appStore';
import { VoucherSigner } from './signer';
import { RootUpdater } from './rootUpdater';
import { config } from './config';
import { logger } from './logger';

const KV_TREE_TICK_AT = 'tree_builder_last_tick_at';
const SECONDS_IN_MILLISECONDS_THRESHOLD = 10_000_000_000; // ~year 2286 in seconds

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
      const tickAt = Math.floor(Date.now() / 1000);
      await this.store.setKv(KV_TREE_TICK_AT, String(tickAt));

      const lastEpochKv = await this.store.getKv('last_epoch_at');
      let lastEpochTime = Number(lastEpochKv ?? 0);
      if (Number.isNaN(lastEpochTime) || lastEpochTime < 0) {
        logger.warn({ last_epoch_at: lastEpochKv }, 'invalid last_epoch_at in kv, resetting to 0');
        lastEpochTime = 0;
      }
      // Self-heal old/broken values accidentally stored in milliseconds.
      if (lastEpochTime > SECONDS_IN_MILLISECONDS_THRESHOLD) {
        const normalized = Math.floor(lastEpochTime / 1000);
        logger.warn(
          { old_last_epoch_at: lastEpochTime, normalized_last_epoch_at: normalized },
          'last_epoch_at looks like milliseconds, normalizing to seconds',
        );
        lastEpochTime = normalized;
        await this.store.setKv('last_epoch_at', String(lastEpochTime));
      }

      let active = await this.gameServer.listActiveSince(lastEpochTime);
      if (!force && active.length === 0 && this.state.epoch === 0 && this.state.tree.size === 0) {
        // Bootstrap fallback: if initial boundary is broken/missing, seed from all known users.
        const bootstrap = await this.gameServer.listActiveSince(0);
        if (bootstrap.length > 0) {
          logger.warn(
            { users: bootstrap.length },
            'no incremental activity but users exist, bootstrapping first Merkle epoch from full user set',
          );
          active = bootstrap;
        }
      }

      if (active.length === 0 && !force) {
        logger.info(
          {
            epoch: this.state.epoch,
            tree_size: this.state.tree.size,
            outcome: 'skip_no_activity',
          },
          'tree tick: no new user activity since last epoch boundary',
        );
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
        logger.info(
          {
            epoch: this.state.epoch,
            tree_size: this.state.tree.size,
            active_users: active.length,
            outcome: 'skip_root_unchanged',
          },
          'tree tick: Merkle root unchanged, epoch not advanced',
        );
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
