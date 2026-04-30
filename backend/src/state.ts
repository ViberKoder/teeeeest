import { Address } from '@ton/core';
import { AirdropTree } from '@rmj/contracts';
import type { AppStore } from './store/appStore';
import { config } from './config';
import { logger } from './logger';

/**
 * In-memory snapshot of the current Airdrop HashMap plus atomic helpers
 * to read balances, advance epochs and generate Merkle proofs.
 *
 * The tree state is periodically persisted to the `kv` table as a
 * serialized BoC so that restarts don't lose everything, and on startup
 * we hydrate from the DB rows in `users` as the source of truth.
 */
export class AirdropState {
  tree: AirdropTree;
  epoch: number;

  private constructor(tree: AirdropTree, epoch: number) {
    this.tree = tree;
    this.epoch = epoch;
  }

  static async hydrate(store: AppStore): Promise<AirdropState> {
    const tree = new AirdropTree();
    const rows = await store.listUsersForHydration();

    const expired = Math.floor(Date.now() / 1000) + config.PROOF_VALIDITY_WINDOW_DAYS * 86_400;

    for (const row of rows) {
      const cumulative = BigInt(row.cumulative_amount);
      if (cumulative === 0n) continue;
      try {
        const addr = Address.parse(row.address);
        tree.set(addr, {
          cumulativeAmount: cumulative,
          startFrom: 0,
          expiredAt: expired,
        });
      } catch (e) {
        logger.warn({ address: row.address, error: (e as Error).message }, 'skipping invalid address');
      }
    }

    const epochStr = await store.getKv('current_epoch');
    const epoch = epochStr ? Number(epochStr) : 0;

    logger.info({ users: tree.size, epoch }, 'airdrop state hydrated');
    return new AirdropState(tree, epoch);
  }

  getCumulative(address: Address): bigint {
    return this.tree.get(address)?.cumulativeAmount ?? 0n;
  }

  rootBigint(): bigint {
    return this.tree.root();
  }

  rootHex(): string {
    return '0x' + this.tree.rootBuffer().toString('hex');
  }

  /**
   * Apply a batch of (address → new cumulative amount) updates. Called by
   * the tree builder when advancing an epoch.
   */
  applyUpdates(updates: Array<{ address: Address; cumulative: bigint }>): void {
    const expired = Math.floor(Date.now() / 1000) + config.PROOF_VALIDITY_WINDOW_DAYS * 86_400;
    for (const { address, cumulative } of updates) {
      this.tree.set(address, {
        cumulativeAmount: cumulative,
        startFrom: 0,
        expiredAt: expired,
      });
    }
  }

  async advanceEpoch(store: AppStore): Promise<number> {
    this.epoch += 1;
    await store.setKv('current_epoch', String(this.epoch));
    return this.epoch;
  }
}
